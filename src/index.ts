import {
    getActiveEditor,
    type IEventBusMap,
    Plugin,
    Setting,
    showMessage,
} from "siyuan";
import {
    DEFAULT_CONFIG,
    normalizeConfig,
    type RecognitionConfig,
} from "./config";
import {BetlangEngine} from "./detector/BetlangEngine";
import {LanguageDetector} from "./detector/LanguageDetector";
import {RuleDetector} from "./detector/RuleDetector";
import type zhCN from "./i18n/zh-CN.json";
import {CodeBlockRecognizer} from "./siyuan/CodeBlockRecognizer";

const STORAGE_NAME = "config.json";

type WindowWithHighlightJs = Window & {
    hljs?: {
        getLanguage(language: string): unknown;
    };
};

export default class CodeRecognitionPlugin extends Plugin {
    declare i18n: typeof zhCN;

    private config: RecognitionConfig = normalizeConfig(DEFAULT_CONFIG);
    private recognizer?: CodeBlockRecognizer;
    private engineErrorReported = false;

    private readonly handleLoadedProtyle = (event: CustomEvent<IEventBusMap["loaded-protyle-static"]>) => {
        this.recognizer?.attach(event.detail.protyle);
    };

    private readonly handleLoadedDynamicProtyle = (event: CustomEvent<IEventBusMap["loaded-protyle-dynamic"]>) => {
        this.recognizer?.attach(event.detail.protyle);
    };

    private readonly handleSwitchProtyle = (event: CustomEvent<IEventBusMap["switch-protyle"]>) => {
        this.recognizer?.attach(event.detail.protyle);
    };

    private readonly handleDestroyProtyle = (event: CustomEvent<IEventBusMap["destroy-protyle"]>) => {
        this.recognizer?.detach(event.detail.protyle);
    };

    private readonly handlePaste = (event: CustomEvent<IEventBusMap["paste"]>) => {
        this.recognizer?.handlePaste(event.detail.protyle);
    };

    private readonly handleBlockMenu = (event: CustomEvent<IEventBusMap["click-blockicon"]>) => {
        const {blockElements, menu, protyle} = event.detail;
        const codeBlocks = this.recognizer?.getCodeBlocks(blockElements) ?? [];
        if (codeBlocks.length === 0) {
            return;
        }
        menu.addItem({
            id: "code-recognition-recognize-blocks",
            disabled: protyle.disabled,
            icon: "iconCode",
            label: this.i18n.recognizeBlockMenu,
            click: () => void this.runRecognition(() => this.recognizer?.recognizeBlocks(protyle, codeBlocks)),
        });
    };

    private readonly handleDocumentMenu = (event: CustomEvent<IEventBusMap["click-editortitleicon"]>) => {
        const {menu, protyle} = event.detail;
        menu.addItem({
            id: "code-recognition-recognize-document",
            disabled: protyle.disabled,
            icon: "iconCode",
            label: this.i18n.recognizeDocumentMenu,
            click: () => void this.runRecognition(() => this.recognizer?.recognizeDocument(protyle)),
        });
    };

    async onload(): Promise<void> {
        try {
            this.config = normalizeConfig(await this.loadData(STORAGE_NAME));
        } catch (error) {
            this.reportError(error, this.i18n.loadConfigFailed);
        }

        const isLanguageAvailable = (language: string) =>
            Boolean((window as WindowWithHighlightJs).hljs?.getLanguage(language));
        const detector = new LanguageDetector(
            new BetlangEngine(this.name),
            new RuleDetector(isLanguageAvailable),
            isLanguageAvailable,
            error => {
                if (!this.engineErrorReported) {
                    this.engineErrorReported = true;
                    this.reportError(error, this.i18n.engineFallback);
                }
            },
        );
        this.recognizer = new CodeBlockRecognizer({
            detector,
            getConfig: () => this.config,
            onError: error => this.reportError(error, this.i18n.recognitionFailed),
        });

        this.eventBus.on("loaded-protyle-static", this.handleLoadedProtyle);
        this.eventBus.on("loaded-protyle-dynamic", this.handleLoadedDynamicProtyle);
        this.eventBus.on("switch-protyle", this.handleSwitchProtyle);
        this.eventBus.on("destroy-protyle", this.handleDestroyProtyle);
        this.eventBus.on("paste", this.handlePaste);
        this.eventBus.on("click-blockicon", this.handleBlockMenu);
        this.eventBus.on("click-editortitleicon", this.handleDocumentMenu);
        this.addCommand({
            langKey: "recognizeCurrent",
            editorCallback: protyle =>
                void this.runRecognition(() => this.recognizer?.recognizeCurrentOrSelected(protyle)),
        });
        this.setting = this.createSetting();
    }

    onLayoutReady(): void {
        const editor = getActiveEditor();
        if (editor) {
            this.recognizer?.attach(editor.protyle);
        }
    }

    onunload(): void {
        this.eventBus.off("loaded-protyle-static", this.handleLoadedProtyle);
        this.eventBus.off("loaded-protyle-dynamic", this.handleLoadedDynamicProtyle);
        this.eventBus.off("switch-protyle", this.handleSwitchProtyle);
        this.eventBus.off("destroy-protyle", this.handleDestroyProtyle);
        this.eventBus.off("paste", this.handlePaste);
        this.eventBus.off("click-blockicon", this.handleBlockMenu);
        this.eventBus.off("click-editortitleicon", this.handleDocumentMenu);
        this.recognizer?.destroy();
    }

    private createSetting(): Setting {
        const setting = new Setting({confirmCallback: () => void this.saveConfig()});
        setting.addItem({
            title: this.i18n.enabled,
            description: this.i18n.enabledDescription,
            actionElement: this.createCheckbox(this.config.enabled, value => this.config.enabled = value),
        });
        setting.addItem({
            title: this.i18n.detectOnPaste,
            description: this.i18n.detectOnPasteDescription,
            actionElement: this.createCheckbox(this.config.detectOnPaste, value => this.config.detectOnPaste = value),
        });

        return setting;
    }

    private createCheckbox(checked: boolean, onChange: (value: boolean) => void): HTMLInputElement {
        const input = document.createElement("input");
        input.className = "b3-switch fn__flex-center";
        input.type = "checkbox";
        input.checked = checked;
        input.addEventListener("change", () => onChange(input.checked));
        return input;
    }

    private async runRecognition(
        action: () => Promise<{total: number; updated: number;}> | undefined,
    ): Promise<void> {
        try {
            const result = await action();
            if (!result) {
                return;
            }
            const message = result.updated > 0 ?
                this.i18n.recognitionComplete.replace("{count}", String(result.updated)) :
                this.i18n.noLanguageRecognized;
            showMessage(message, 4000);
        } catch (error) {
            this.reportError(error, this.i18n.recognitionFailed);
        }
    }

    private async saveConfig(): Promise<void> {
        try {
            await this.saveData(STORAGE_NAME, this.config);
        } catch (error) {
            this.reportError(error, this.i18n.saveConfigFailed);
        }
    }

    private reportError(error: unknown, message: string): void {
        console.error(`[${this.name}] ${message}`, error);
        showMessage(`${this.displayName}: ${message}`, 5000, "error");
    }
}
