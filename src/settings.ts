import {App, PluginSettingTab, Setting} from "obsidian";
import VoiceNotePlugin from "./main";

export interface VoiceNoteSettings {
	apiKey: string;
	transcriptionModel: string;
	noteModel: string;
	notePrompt: string;
}

const TRANSCRIPTION_MODELS: Record<string, string> = {
	"whisper-1": "whisper-1",
	"gpt-4o-transcribe": "gpt-4o-transcribe"
};

const NOTE_MODELS: Record<string, string> = {
	"gpt-4o-mini": "gpt-4o-mini",
	"gpt-5-mini": "gpt-5-mini"
};

const hasOption = (options: Record<string, string>, value: string): boolean =>
	Object.prototype.hasOwnProperty.call(options, value);

export const DEFAULT_SETTINGS: VoiceNoteSettings = {
	apiKey: "",
	transcriptionModel: "whisper-1",
	noteModel: "gpt-4o-mini",
	notePrompt:
		"You are an assistant that turns voice transcripts into clean Obsidian notes. " +
		"Return a concise note in Markdown with a short title, bullet points, and clear sections when helpful. " +
		"Remove filler words, keep the original meaning, and avoid adding new facts."
};

export class VoiceNoteSettingTab extends PluginSettingTab {
	plugin: VoiceNotePlugin;

	constructor(app: App, plugin: VoiceNotePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("OpenAI API key")
			.setDesc("Used to transcribe audio and create notes.")
			.addText((text) => {
				text.setPlaceholder("sk-...")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value.trim();
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";
			});

		new Setting(containerEl)
			.setName("Transcription model")
			.setDesc("Model used for speech-to-text.")
			.addDropdown((dropdown) => {
				dropdown.addOptions(TRANSCRIPTION_MODELS);
				if (!hasOption(TRANSCRIPTION_MODELS, this.plugin.settings.transcriptionModel)) {
					dropdown.addOption(
						this.plugin.settings.transcriptionModel,
						`${this.plugin.settings.transcriptionModel} (custom)`
					);
				}
				dropdown
					.setValue(this.plugin.settings.transcriptionModel)
					.onChange(async (value) => {
						this.plugin.settings.transcriptionModel = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Note creation model")
			.setDesc("Model used to turn transcripts into notes.")
			.addDropdown((dropdown) => {
				dropdown.addOptions(NOTE_MODELS);
				if (!hasOption(NOTE_MODELS, this.plugin.settings.noteModel)) {
					dropdown.addOption(
						this.plugin.settings.noteModel,
						`${this.plugin.settings.noteModel} (custom)`
					);
				}
				dropdown.setValue(this.plugin.settings.noteModel).onChange(async (value) => {
					this.plugin.settings.noteModel = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Note prompt")
			.setDesc("Instruction used to format the final note.")
			.addTextArea((text) =>
				text
					.setPlaceholder("Describe how the note should look...")
					.setValue(this.plugin.settings.notePrompt)
					.onChange(async (value) => {
						this.plugin.settings.notePrompt = value.trim();
						await this.plugin.saveSettings();
					})
			);
	}
}
