import {App, MarkdownView, Notice} from "obsidian";
import {VoiceNoteSettings} from "../settings";

export type RecordingState = "idle" | "recording" | "processing";

type StateListener = (state: RecordingState) => void;

const DEFAULT_MIME_TYPE = "audio/webm;codecs=opus";

export class VoiceNoteService {
	private app: App;
	private getSettings: () => VoiceNoteSettings;
	private onStateChange?: StateListener;
	private mediaRecorder: MediaRecorder | null = null;
	private chunks: Blob[] = [];
	private state: RecordingState = "idle";

	constructor(app: App, getSettings: () => VoiceNoteSettings, onStateChange?: StateListener) {
		this.app = app;
		this.getSettings = getSettings;
		this.onStateChange = onStateChange;
	}

	getState(): RecordingState {
		return this.state;
	}

	async toggleRecording(): Promise<void> {
		if (this.state === "recording") {
			await this.stopRecording();
			return;
		}

		if (this.state === "processing") {
			new Notice("Already processing the previous recording.");
			return;
		}

		await this.startRecording();
	}

	async stopIfRecording(): Promise<void> {
		if (this.state === "recording") {
			await this.stopRecording();
		}
	}

	private async startRecording(): Promise<void> {
		if (!navigator.mediaDevices?.getUserMedia) {
			new Notice("Microphone access is not available.");
			return;
		}

		const stream = await navigator.mediaDevices.getUserMedia({audio: true});
		const mimeType = MediaRecorder.isTypeSupported(DEFAULT_MIME_TYPE)
			? DEFAULT_MIME_TYPE
			: "";
		const recorder = mimeType ? new MediaRecorder(stream, {mimeType}) : new MediaRecorder(stream);

		this.mediaRecorder = recorder;
		this.chunks = [];

		recorder.addEventListener("dataavailable", (event: BlobEvent) => {
			if (event.data.size > 0) {
				this.chunks.push(event.data);
			}
		});

		recorder.addEventListener(
			"stop",
			() => {
				stream.getTracks().forEach((track) => track.stop());
			},
			{once: true}
		);

		recorder.start();
		this.setState("recording");
		new Notice("Recording started.");
	}

	private async stopRecording(): Promise<void> {
		const recorder = this.mediaRecorder;
		if (!recorder) {
			return;
		}

		this.setState("processing");
		this.mediaRecorder = null;

		const audioBlob = await new Promise<Blob>((resolve) => {
			recorder.addEventListener(
				"stop",
				() => {
					const blob = new Blob(this.chunks, {type: recorder.mimeType || "audio/webm"});
					resolve(blob);
				},
				{once: true}
			);
			recorder.stop();
		});

		try {
			const transcript = await this.transcribeAudio(audioBlob);
			const note = await this.generateNote(transcript);
			await this.insertNote(note);
			new Notice("Voice note inserted.");
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to process recording.";
			new Notice(message);
		} finally {
			this.chunks = [];
			this.setState("idle");
		}
	}

	private async transcribeAudio(audioBlob: Blob): Promise<string> {
		const settings = this.getSettings();
		if (!settings.apiKey) {
			throw new Error("Add your OpenAI API key in settings.");
		}
		if (!settings.transcriptionModel) {
			throw new Error("Set a transcription model in settings.");
		}

		const fileName = audioBlob.type.includes("ogg") ? "recording.ogg" : "recording.webm";
		const file = new File([audioBlob], fileName, {type: audioBlob.type || "audio/webm"});
		const formData = new FormData();
		formData.append("file", file);
		formData.append("model", settings.transcriptionModel);
		formData.append("response_format", "json");

		const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${settings.apiKey}`
			},
			body: formData
		});

		if (!response.ok) {
			const message = await response.text();
			throw new Error(`Transcription failed: ${message}`);
		}

		const data = (await response.json()) as {text?: string};
		const text = data.text?.trim();
		if (!text) {
			throw new Error("Transcription returned no text.");
		}

		return text;
	}

	private async generateNote(transcript: string): Promise<string> {
		const settings = this.getSettings();
		if (!settings.apiKey) {
			throw new Error("Add your OpenAI API key in settings.");
		}
		if (!settings.noteModel) {
			throw new Error("Set a note creation model in settings.");
		}

		const body: {
			model: string;
			messages: Array<{role: "system" | "user"; content: string}>;
			temperature?: number;
		} = {
			model: settings.noteModel,
			messages: [
				{role: "system", content: settings.notePrompt},
				{role: "user", content: `Transcript:\n${transcript}`}
			]
		};

		if (this.supportsTemperature(settings.noteModel)) {
			body.temperature = 0.2;
		}

		const response = await fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${settings.apiKey}`
			},
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			const message = await response.text();
			throw new Error(`Note creation failed: ${message}`);
		}

		const data = (await response.json()) as {
			choices?: Array<{message?: {content?: string}}>;
		};
		const content = data.choices?.[0]?.message?.content;
		if (!content) {
			throw new Error("Note creation returned no content.");
		}

		return content.trim();
	}

	private async insertNote(note: string): Promise<void> {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			throw new Error("Open a note to insert the transcript.");
		}

		const editor = view.editor;
		editor.replaceSelection(`${note}\n`);
	}

	private setState(state: RecordingState): void {
		this.state = state;
		this.onStateChange?.(state);
	}

	private supportsTemperature(model: string): boolean {
		const normalized = model.trim().toLowerCase();
		return normalized !== "gpt-5-mini";
	}
}
