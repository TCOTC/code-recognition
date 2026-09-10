export interface LanguageScore {
    language: string;
    score: number;
}

interface BetlangModule {
    default(
        input?: {module_or_path: RequestInfo | URL | Response | BufferSource | WebAssembly.Module;},
    ): Promise<unknown>;
    detect_scores(source: string): string;
}

const SAMPLE_SIZE = 4096;

const sample = (source: string): string => {
    const bytes = new TextEncoder().encode(source);
    if (bytes.length <= SAMPLE_SIZE * 2) {
        return source;
    }
    const sampled = new Uint8Array(SAMPLE_SIZE * 2);
    sampled.set(bytes.subarray(0, SAMPLE_SIZE));
    sampled.set(bytes.subarray(bytes.length - SAMPLE_SIZE), SAMPLE_SIZE);
    return new TextDecoder().decode(sampled);
};

export class BetlangEngine {
    private readonly moduleUrl: string;
    private readonly wasmUrl: string;
    private modulePromise?: Promise<BetlangModule>;

    constructor(pluginName: string) {
        const baseUrl = `/plugins/${encodeURIComponent(pluginName)}/wasm`;
        this.moduleUrl = `${baseUrl}/betlang_wasm.js`;
        this.wasmUrl = `${baseUrl}/betlang_wasm_bg.wasm`;
    }

    async detect(source: string): Promise<LanguageScore[]> {
        const module = await this.load();
        return module.detect_scores(sample(source)).trim().split("\n").flatMap(line => {
            const separator = line.lastIndexOf(":");
            const score = Number(line.slice(separator + 1));
            return separator > 0 && Number.isFinite(score) ?
                [{language: line.slice(0, separator), score}] :
                [];
        });
    }

    private load(): Promise<BetlangModule> {
        this.modulePromise ??= import(/* webpackIgnore: true */ this.moduleUrl).then(async imported => {
            const module = imported as unknown as BetlangModule;
            await module.default({module_or_path: this.wasmUrl});
            return module;
        });
        return this.modulePromise;
    }
}
