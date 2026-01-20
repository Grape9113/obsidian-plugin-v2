import {Plugin} from "obsidian";
import {DEFAULT_SETTINGS, VoiceNoteSettings, VoiceNoteSettingTab} from "./settings";
import {RecordingState, VoiceNoteService} from "./services/voice-note-service";

export default class VoiceNotePlugin extends Plugin {
	settings: VoiceNoteSettings;
	private voiceNoteService: VoiceNoteService;
	private ribbonIconEl: HTMLElement | null = null;

	async onload() {
		await this.loadSettings();

		this.voiceNoteService = new VoiceNoteService(
			this.app,
			() => this.settings,
			(state) => this.updateRibbonState(state)
		);

		this.ribbonIconEl = this.addRibbonIcon("mic", "Start recording voice note", () => {
			void this.voiceNoteService.toggleRecording();
		});
		this.ribbonIconEl.addClass("voice-note-ribbon");

		this.addCommand({
			id: "toggle-voice-note-recording",
			name: "Toggle voice note recording",
			callback: () => {
				void this.voiceNoteService.toggleRecording();
			}
		});

		this.addSettingTab(new VoiceNoteSettingTab(this.app, this));
	}

	async onunload() {
		await this.voiceNoteService?.stopIfRecording();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private updateRibbonState(state: RecordingState): void {
		if (!this.ribbonIconEl) {
			return;
		}

		this.ribbonIconEl.toggleClass("voice-note-recording", state === "recording");
		this.ribbonIconEl.toggleClass("voice-note-processing", state === "processing");

		if (state === "recording") {
			this.ribbonIconEl.setAttribute("aria-label", "Stop recording voice note");
		} else if (state === "processing") {
			this.ribbonIconEl.setAttribute("aria-label", "Processing voice note");
		} else {
			this.ribbonIconEl.setAttribute("aria-label", "Start recording voice note");
		}
	}
}
