import { ApiClientConfiguration } from "./api-client";
import { GlobalState } from "./state";
import { ClaudeAskResponse } from "./task-communication"
import { AmplitudeWebviewMessage } from "./tracking"

export type Resource =
	| { id: string; type: "file" | "folder"; name: string }
	| { id: string; type: "url"; description: string; name: string }

type RenameTask =
	| {
			type: "renameTask"
			taskId: string
			isCurentTask?: undefined
	  }
	| {
			type: "renameTask"
			taskId?: undefined
			isCurentTask: boolean
	  }

type OpenExternalLink = {
	type: "openExternalLink"
	url: string
}

type FreeTrial = {
	type: "freeTrial"
	fp: string
}

type ApiConfigurationMessage = {
	type: "apiConfiguration"
	apiConfiguration: NonNullable<ApiClientConfiguration>
}

type setUseUdiff = {
	type: "useUdiff"
	bool: boolean
}

type QuickstartMessage = {
	type: "quickstart"
	repo: string
	name: string
}

type experimentalTerminalMessage = {
	type: "experimentalTerminal"
	bool: boolean
}

type exportBugMessage = {
	type: "exportBug"
	description: string
	reproduction: string
}

type technicalBackgroundMessage = {
	type: "technicalBackground"
	value: NonNullable<GlobalState["technicalBackground"]>
}

type DebugMessage = {
	type: "debug"
}

export type GitCheckoutToMessage = {
	type: "gitCheckoutTo"
	branchName: string
}

type UpdateTaskHistoryMessage = {
	type: "updateTaskHistory"
	history: string
}

export type ExecuteCommandMessage = {
	type: "executeCommand"
	command: string
	isEnter: boolean
	commandId?: string
}

export type CommandInputMessage = {
	type: "commandInput"
	commandId: string
	input: string
}

export type ToolFeedbackMessage = {
	type: "toolFeedback"
	toolId: number
	feedback: "approve" | "reject"
}

export type ToolFeedbackAllMessage = {
	type: "toolFeedbackAll"
	feedback: "approve" | "reject"
}

export type updateGlobalStateMessage = {
	type: "updateGlobalState"
	state: Partial<GlobalState>
}

export type autoCloseTerminalMessage = {
	type: "autoCloseTerminal"
	bool: boolean
}

export type WebviewMessage =
	| updateGlobalStateMessage
	| ToolFeedbackAllMessage
	| ToolFeedbackMessage
	| exportBugMessage
	| experimentalTerminalMessage
	| AmplitudeWebviewMessage
	| OpenExternalLink
	| FreeTrial
	| technicalBackgroundMessage
	| autoCloseTerminalMessage
	| ApiConfigurationMessage
	| RenameTask
	| QuickstartMessage
	| setUseUdiff
	| DebugMessage
	| GitCheckoutToMessage
	| UpdateTaskHistoryMessage
	| ExecuteCommandMessage
	| CommandInputMessage
	| {
			type:
				| "skipWriteAnimation"
				| "cancelCurrentRequest"
				| "maxRequestsPerTask"
				| "customInstructions"
				| "alwaysAllowReadOnly"
				| "webviewDidLaunch"
				| "newTask"
				| "askResponse"
				| "retryTask"
				| "alwaysAllowWriteOnly"
				| "clearTask"
				| "didCloseAnnouncement"
				| "selectImages"
				| "exportCurrentTask"
				| "showTaskWithId"
				| "deleteTaskWithId"
				| "exportTaskWithId"
				| "abortAutomode"
				| "didClickKoduSignOut"
				| "fetchKoduCredits"
				| "didDismissKoduPromo"
				| "resetState"
				| "setCreativeMode"
				| "fileTree"
				| "clearHistory"
				| "gitLog"
				| "gitBranches"
				| "getTaskHistory"
			text?: string
			askResponse?: ClaudeAskResponse
			images?: string[]
			attachements?: Resource[]
			bool?: boolean
	  }