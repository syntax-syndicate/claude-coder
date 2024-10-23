import { Anthropic } from "@anthropic-ai/sdk"
import axios, { CancelTokenSource } from "axios"
import * as vscode from "vscode"
import { z } from "zod"
import { KODU_MODELS, koduDefaultModelId, KoduModelId, MODAL_TEMPERATURES, ModelInfo } from "./kodu-api-models"
import { ApiClientOptions, KODU_ERROR_CODES, KODU_ERROR_MESSAGES, KoduError, KoduSSEResponse } from "@/types"
import { healMessages } from "./auto-heal"
import { withoutImageData } from "@/utils"
import { AskConsultantResponseDto, SummaryResponseDto, WebSearchResponseDto } from "./dto"
import {
	getKoduBugReportUrl,
	getKoduConsultantUrl,
	getKoduInferenceUrl,
	getKoduScreenshotUrl,
	getKoduSummarizeUrl,
	getKoduWebSearchUrl,
} from "./kodu-api-routes"

let previousSystemPrompt = "" // TODO: refactor to inside the class
const bugReportSchema = z.object({
	description: z.string(),
	reproduction: z.string(),
	apiHistory: z.string(),
	claudeMessage: z.string(),
})

export class KoduApiClient {
	private options: ApiClientOptions
	private cancelTokenSource: CancelTokenSource | null = null

	constructor(options: ApiClientOptions) {
		this.options = options
	}

	async abortRequest(): Promise<void> {
		if (this.cancelTokenSource) {
			this.cancelTokenSource.cancel("Request aborted by user")
			this.cancelTokenSource = null
		}
	}

	async *createMessageStream(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		creativeMode?: "normal" | "creative" | "deterministic",
		abortSignal?: AbortSignal | null,
		customInstructions?: string,
		userMemory?: string,
		environmentDetails?: string
	): AsyncIterableIterator<KoduSSEResponse> {
		const modelId = this.getModel().id
		let requestBody: Anthropic.Beta.PromptCaching.Messages.MessageCreateParamsNonStreaming
		console.log(`creativeMode: ${creativeMode}`)
		const creativitySettings = MODAL_TEMPERATURES[creativeMode ?? "normal"]
		// check if the root of the folder has .kodu file if so read the content and use it as the system prompt
		let dotKoduFileContent = ""
		const workspaceFolders = vscode.workspace.workspaceFolders
		if (workspaceFolders) {
			for (const folder of workspaceFolders) {
				const dotKoduFile = vscode.Uri.joinPath(folder.uri, ".kodu")
				try {
					const fileContent = await vscode.workspace.fs.readFile(dotKoduFile)
					dotKoduFileContent = Buffer.from(fileContent).toString("utf8")
					console.log(".kodu file content:", dotKoduFileContent)
					break // Exit the loop after finding and reading the first .kodu file
				} catch (error) {
					console.log(`No .kodu file found in ${folder.uri.fsPath}`)
				}
			}
		}
		const system: Anthropic.Beta.PromptCaching.Messages.PromptCachingBetaTextBlockParam[] = [
			{ text: systemPrompt.trim(), type: "text" },
		]
		if (previousSystemPrompt !== systemPrompt) {
			console.error("System prompt changed")
			console.error("Previous system prompt:", previousSystemPrompt)
			console.error("Current system prompt:", systemPrompt)
			console.error(`Length difference: ${previousSystemPrompt.length - systemPrompt.length}`)
		}
		previousSystemPrompt = systemPrompt
		// if (dotKoduFileContent) {
		// 	system.push({
		// 		text: dotKoduFileContent,
		// 		type: "text",
		// 		// cache_control: { type: "ephemeral" },
		// 	})
		// }
		if (customInstructions && customInstructions.trim()) {
			system.push({
				text: customInstructions,
				type: "text",
				cache_control: { type: "ephemeral" },
			})
		} else {
			system[0].cache_control = { type: "ephemeral" }
		}
		// if (environmentDetails) {
		// 	system.push({
		// 		text: environmentDetails,
		// 		type: "text",
		// 	})
		// }
		/**
		 * push it last to not break the cache
		 */
		// system.push({
		// 	text: USER_TASK_HISTORY_PROMPT(userMemory),
		// 	type: "text",
		// 	cache_control: { type: "ephemeral" },
		// })

		switch (modelId) {
			case "claude-3-5-sonnet-20240620":
			case "claude-3-opus-20240229":
			case "claude-3-haiku-20240307":
				console.log("Matched anthropic cache model")
				const userMsgIndices = messages.reduce(
					(acc, msg, index) => (msg.role === "user" ? [...acc, index] : acc),
					[] as number[]
				)
				const lastUserMsgIndex = userMsgIndices[userMsgIndices.length - 1] ?? -1
				const secondLastMsgUserIndex = userMsgIndices[userMsgIndices.length - 2] ?? -1
				requestBody = {
					model: modelId,
					max_tokens: this.getModel().info.maxTokens,
					system,
					messages: healMessages(messages).map((message, index) => {
						if (index === lastUserMsgIndex || index === secondLastMsgUserIndex) {
							if (index === lastUserMsgIndex && environmentDetails) {
								// 								environmentDetails = `
								// <critical_context>
								// Write to file critical instructions:
								// <write_to_file>
								// YOU MUST NEVER TRUNCATE THE CONTENT OF A FILE WHEN USING THE write_to_file TOOL.
								// ALWAYS PROVIDE THE COMPLETE CONTENT OF THE FILE IN YOUR RESPONSE.
								// ALWAYS INCLUDE THE FULL CONTENT OF THE FILE, EVEN IF IT HASN'T BEEN MODIFIED.
								// DOING SOMETHING LIKE THIS BREAKS THE TOOL'S FUNCTIONALITY:
								// // ... (previous code remains unchanged)
								// </write_to_file>
								// environment details:
								// ${environmentDetails}
								// </critical_context>
								// 								`
								if (typeof message.content === "string") {
									// add environment details to the last user message
									return {
										...message,
										content: [
											{
												text: environmentDetails,
												type: "text",
											},
											{
												text: message.content,
												type: "text",
												cache_control: { type: "ephemeral" },
											},
										],
									}
								} else {
									message.content.push({
										text: environmentDetails,
										type: "text",
									})
								}
							}
							return {
								...message,
								content:
									typeof message.content === "string"
										? [
												{
													type: "text",
													text: message.content,
													cache_control: { type: "ephemeral" },
												},
										  ]
										: message.content.map((content, contentIndex) =>
												contentIndex === message.content.length - 1
													? { ...content, cache_control: { type: "ephemeral" } }
													: content
										  ),
							}
						}
						return message
					}),
				}
				break
			default:
				console.log("Matched default model")
				requestBody = {
					model: modelId,
					max_tokens: this.getModel().info.maxTokens,
					system: [{ text: systemPrompt, type: "text" }],
					messages,
					...creativitySettings,
					// temperature: 0,
				}
		}
		this.cancelTokenSource = axios.CancelToken.source()

		const response = await axios.post(
			getKoduInferenceUrl(),
			{
				...requestBody,
			},
			{
				headers: {
					"Content-Type": "application/json",
					"x-api-key": this.options.koduApiKey || "",
				},
				responseType: "stream",
				signal: abortSignal ?? undefined,
				timeout: 60_000,
			}
		)

		if (response.status !== 200) {
			if (response.status in KODU_ERROR_MESSAGES) {
				throw new KoduError({
					code: response.status as keyof typeof KODU_ERROR_MESSAGES,
				})
			}
			throw new KoduError({
				code: KODU_ERROR_CODES.NETWORK_REFUSED_TO_CONNECT,
			})
		}

		if (response.data) {
			const reader = response.data
			const decoder = new TextDecoder("utf-8")
			let finalResponse: Extract<KoduSSEResponse, { code: 1 }> | null = null
			let partialResponse: Extract<KoduSSEResponse, { code: 2 }> | null = null
			let buffer = ""

			for await (const chunk of reader) {
				buffer += decoder.decode(chunk, { stream: true })
				const lines = buffer.split("\n\n")
				buffer = lines.pop() || ""
				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const eventData = JSON.parse(line.slice(6)) as KoduSSEResponse
						if (eventData.code === 2) {
							// -> Happens to the current message
							// We have a partial response, so we need to add it to the message shown to the user and refresh the UI
						}
						if (eventData.code === 0) {
						} else if (eventData.code === 1) {
							finalResponse = eventData
						} else if (eventData.code === -1) {
							console.error("Network / API ERROR")
							// we should yield the error and not throw it
						}
						yield eventData
					}
				}

				if (finalResponse) {
					break
				}
			}

			if (!finalResponse) {
				throw new KoduError({
					code: KODU_ERROR_CODES.NETWORK_REFUSED_TO_CONNECT,
				})
			}
		}
	}

	createUserReadableRequest(
		userContent: Array<
			| Anthropic.TextBlockParam
			| Anthropic.ImageBlockParam
			| Anthropic.ToolUseBlockParam
			| Anthropic.ToolResultBlockParam
		>
	): any {
		// if use udf
		return {
			model: this.getModel().id,
			max_tokens: this.getModel().info.maxTokens,
			system: "(see SYSTEM_PROMPT in src/agent/system-prompt.ts)",
			messages: [{ conversation_history: "..." }, { role: "user", content: withoutImageData(userContent) }],
			tools: "(see tools in src/agent/v1/tools/schema/index.ts)",
			tool_choice: { type: "auto" },
		}
	}

	getModel(): { id: KoduModelId; info: ModelInfo } {
		const modelId = this.options.apiModelId
		if (modelId && modelId in KODU_MODELS) {
			const id = modelId as KoduModelId
			return { id, info: KODU_MODELS[id] }
		}
		return { id: koduDefaultModelId, info: KODU_MODELS[koduDefaultModelId] }
	}

	async sendWebSearchRequest(searchQuery: string, baseLink: string): Promise<WebSearchResponseDto> {
		this.cancelTokenSource = axios.CancelToken.source()

		const response = await axios.post(
			getKoduWebSearchUrl(),
			{
				searchQuery,
				baseLink,
			},
			{
				headers: {
					"Content-Type": "application/json",
					"x-api-key": this.options.koduApiKey || "",
				},
				timeout: 60_000,
				cancelToken: this.cancelTokenSource?.token,
			}
		)

		return response.data
	}

	async sendUrlScreenshotRequest(url: string): Promise<Blob> {
		this.cancelTokenSource = axios.CancelToken.source()

		const response = await axios.post(
			getKoduScreenshotUrl(),
			{
				url,
			},
			{
				responseType: "arraybuffer",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": this.options.koduApiKey || "",
				},
				timeout: 60_000,
				cancelToken: this.cancelTokenSource?.token,
			}
		)

		return new Blob([response.data], { type: "image/jpeg" })
	}

	async sendAskConsultantRequest(query: string): Promise<AskConsultantResponseDto> {
		this.cancelTokenSource = axios.CancelToken.source()

		const response = await axios.post(
			getKoduConsultantUrl(),
			{
				query,
			},
			{
				headers: {
					"Content-Type": "application/json",
					"x-api-key": this.options.koduApiKey || "",
				},
				timeout: 60_000,
				cancelToken: this.cancelTokenSource?.token,
			}
		)

		return response.data
	}

	async sendBugReportRequest(bugReport: z.infer<typeof bugReportSchema>) {
		await axios.post(getKoduBugReportUrl(), bugReport, {
			headers: {
				"Content-Type": "application/json",
				"x-api-key": this.options.koduApiKey || "",
			},
		})
	}

	async sendSummarizeRequest(output: string, command: string): Promise<SummaryResponseDto> {
		this.cancelTokenSource = axios.CancelToken.source()

		const response = await axios.post(
			getKoduSummarizeUrl(),
			{
				output,
				command,
			},
			{
				headers: {
					"Content-Type": "application/json",
					"x-api-key": this.options.koduApiKey || "",
				},
				timeout: 60_000,
				cancelToken: this.cancelTokenSource?.token,
			}
		)

		return response.data
	}
}