import * as vscode from "vscode"
import { ApiModelId } from "../../../shared/api"
import { fetchKoduUser as fetchKoduUserAPI, initVisitor } from "../../../api/kodu"
import { ClaudeDevProvider } from "../ClaudeDevProvider"

type SecretKey = "koduApiKey"

export class ApiManager {
	constructor(private context: ClaudeDevProvider) {}

	async updateApiConfiguration(apiConfiguration: { apiModelId?: ApiModelId; koduApiKey?: string }) {
		const { apiModelId, koduApiKey } = apiConfiguration
		await this.context.getGlobalStateManager().updateGlobalState("apiModelId", apiModelId)
		if (koduApiKey) {
			await this.context.getSecretStateManager().updateSecretState("koduApiKey", koduApiKey)
		}
	}

	async initFreeTrialUser(visitorId: string) {
		this.context.getSecretStateManager().updateSecretState("fp", visitorId)
		const data = await initVisitor({ visitorId })
		if (data) {
			await this.saveKoduApiKey(data.apiKey)
		}
	}

	async saveKoduApiKey(apiKey: string) {
		await this.context.getSecretStateManager().updateSecretState("koduApiKey", apiKey)
		// await this.context.globalState.update("shouldShowKoduPromo", false)
		const user = await this.fetchKoduUser(apiKey)
		// await this.context.globalState.update("user", user)
		await this.context.getGlobalStateManager().updateGlobalState("user", user)
		await this.context.getWebviewManager().postStateToWebview()
		console.log("Posted state to webview after saving Kodu API key")
		await this.context.getWebviewManager().postMessageToWebview({ type: "action", action: "koduAuthenticated" })
		console.log("Posted message to action: koduAuthenticated")
	}

	async signOutKodu() {
		await this.context.getSecretStateManager().deleteSecretState("koduApiKey")
		await this.context.getGlobalStateManager().updateGlobalState("user", undefined)
	}

	async fetchKoduCredits() {
		const koduApiKey = await this.context.getSecretStateManager().getSecretState("koduApiKey")
		if (koduApiKey) {
			const user = await this.fetchKoduUser(koduApiKey)
			if (user) {
				await this.context.getGlobalStateManager().updateGlobalState("user", user)
			}
		}
	}

	private async fetchKoduUser(apiKey: string) {
		return await fetchKoduUserAPI({ apiKey })
	}
}