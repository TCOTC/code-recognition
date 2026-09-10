import {
    getActiveEditor,
    type IEventBusMap,
    type IProtyle,
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
const TOP_BAR_BUTTON_ID = "recognize-code-blocks";
const BREADCRUMB_BUTTON_ID = "recognize-code-blocks";

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
            editorCallback: protyle => this.recognizeCurrentOrSelected(protyle),
        });
        this.syncEntryButtons();
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
        this.removeTopBar(TOP_BAR_BUTTON_ID);
        this.removeBreadcrumbButton(BREADCRUMB_BUTTON_ID);
        this.recognizer?.destroy();
    }

    private createSetting(): Setting {
        const inputs = {
            enabled: this.createCheckbox(this.config.enabled),
            detectOnPaste: this.createCheckbox(this.config.detectOnPaste),
            showTopBarButton: this.createCheckbox(this.config.showTopBarButton),
            showBreadcrumbButton: this.createCheckbox(this.config.showBreadcrumbButton),
        };
        const resetInputs = () => {
            inputs.enabled.checked = this.config.enabled;
            inputs.detectOnPaste.checked = this.config.detectOnPaste;
            inputs.showTopBarButton.checked = this.config.showTopBarButton;
            inputs.showBreadcrumbButton.checked = this.config.showBreadcrumbButton;
        };
        const setting = new Setting({
            confirmCallback: () => {
                this.config = {
                    enabled: inputs.enabled.checked,
                    detectOnPaste: inputs.detectOnPaste.checked,
                    showTopBarButton: inputs.showTopBarButton.checked,
                    showBreadcrumbButton: inputs.showBreadcrumbButton.checked,
                };
                this.syncEntryButtons();
                void this.saveConfig();
            },
            destroyCallback: resetInputs,
        });
        setting.addItem({
            title: this.i18n.enabled,
            description: this.i18n.enabledDescription,
            actionElement: inputs.enabled,
        });
        setting.addItem({
            title: this.i18n.detectOnPaste,
            description: this.i18n.detectOnPasteDescription,
            actionElement: inputs.detectOnPaste,
        });
        setting.addItem({
            title: this.i18n.showTopBarButton,
            description: this.i18n.showTopBarButtonDescription,
            actionElement: inputs.showTopBarButton,
        });
        setting.addItem({
            title: this.i18n.showBreadcrumbButton,
            description: this.i18n.showBreadcrumbButtonDescription,
            actionElement: inputs.showBreadcrumbButton,
        });

        return setting;
    }

    private createCheckbox(checked: boolean): HTMLInputElement {
        const input = document.createElement("input");
        input.className = "b3-switch fn__flex-center";
        input.type = "checkbox";
        input.checked = checked;
        return input;
    }

    private recognizeCurrentOrSelected(protyle: IProtyle): void {
        void this.runRecognition(() => this.recognizer?.recognizeCurrentOrSelected(protyle));
    }

    private syncEntryButtons(): void {
        if (this.config.showTopBarButton) {
            this.addTopBar({
                id: TOP_BAR_BUTTON_ID,
                icon: "iconCode",
                title: this.i18n.recognizeCurrent,
                callback: () => {
                    const editor = getActiveEditor();
                    if (editor) {
                        this.recognizeCurrentOrSelected(editor.protyle);
                    }
                },
            });
        } else {
            this.removeTopBar(TOP_BAR_BUTTON_ID);
        }

        if (this.config.showBreadcrumbButton) {
            this.addBreadcrumbButton({
                id: BREADCRUMB_BUTTON_ID,
                icon: "iconCode",
                title: this.i18n.recognizeCurrent,
                callback: (_event, protyle) => this.recognizeCurrentOrSelected(protyle),
            });
        } else {
            this.removeBreadcrumbButton(BREADCRUMB_BUTTON_ID);
        }
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
