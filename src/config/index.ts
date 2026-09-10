export interface RecognitionConfig {
    enabled: boolean;
    detectOnPaste: boolean;
    showTopBarButton: boolean;
    showBreadcrumbButton: boolean;
}

export const DEFAULT_CONFIG: RecognitionConfig = {
    enabled: true,
    detectOnPaste: true,
    showTopBarButton: false,
    showBreadcrumbButton: false,
};

export const normalizeConfig = (value: unknown): RecognitionConfig => {
    const config = value && typeof value === "object" ? value as Partial<RecognitionConfig> : {};
    return {
        enabled: typeof config.enabled === "boolean" ? config.enabled : DEFAULT_CONFIG.enabled,
        detectOnPaste: typeof config.detectOnPaste === "boolean" ? config.detectOnPaste : DEFAULT_CONFIG.detectOnPaste,
        showTopBarButton: typeof config.showTopBarButton === "boolean" ?
            config.showTopBarButton :
            DEFAULT_CONFIG.showTopBarButton,
        showBreadcrumbButton: typeof config.showBreadcrumbButton === "boolean" ?
            config.showBreadcrumbButton :
            DEFAULT_CONFIG.showBreadcrumbButton,
    };
};
