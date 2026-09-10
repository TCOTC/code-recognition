import type {
    BetlangEngine,
    LanguageScore,
} from "./BetlangEngine";
import type {RuleDetector} from "./RuleDetector";

export interface DetectionResult {
    language: string;
    confidence?: number;
    source: "betlang" | "rule";
}

const BETLANG_TO_HLJS: Record<string, string | undefined> = {
    asm: "x86asm",
    batch: "dos",
    c: "c",
    clojure: "clojure",
    cmake: "cmake",
    cpp: "cpp",
    cs: "csharp",
    css: "css",
    dart: "dart",
    dockerfile: "dockerfile",
    elixir: "elixir",
    erlang: "erlang",
    go: "go",
    gradle: "gradle",
    groovy: "groovy",
    haskell: "haskell",
    html: "html",
    ini: "ini",
    java: "java",
    javascript: "javascript",
    json: "json",
    julia: "julia",
    kotlin: "kotlin",
    lisp: "lisp",
    lua: "lua",
    markdown: "markdown",
    objectivec: "objectivec",
    ocaml: "ocaml",
    perl: "perl",
    php: "php",
    powershell: "powershell",
    python: "python",
    r: "r",
    ruby: "ruby",
    rust: "rust",
    scala: "scala",
    shell: "bash",
    sql: "sql",
    swift: "swift",
    toml: "toml",
    typescript: "typescript",
    vba: "vbnet",
    verilog: "verilog",
    xml: "xml",
    yaml: "yaml",
};

const MINIMUM_CONFIDENCE = 0.2;
const MINIMUM_CONFIDENCE_WITHOUT_CODE_SIGNALS = 0.6;
const CONFIDENCE_GAP = 0.2;

const hasCodeSignals = (source: string) =>
    /[{}()[\];=<>]|^\s{2,}\S/m.test(source) ||
    /\b(?:class|def|fn|func|function|import|package|return|select|const|let|var|public|private)\b/.test(source);

export class LanguageDetector {
    constructor(
        private readonly engine: BetlangEngine,
        private readonly rules: RuleDetector,
        private readonly isLanguageAvailable: (language: string) => boolean,
        private readonly onEngineError: (error: unknown) => void,
    ) {
    }

    async detect(source: string): Promise<DetectionResult | undefined> {
        const code = source.trim();
        if (!code) {
            return;
        }
        const minimumConfidence = hasCodeSignals(code) ?
            MINIMUM_CONFIDENCE :
            MINIMUM_CONFIDENCE_WITHOUT_CODE_SIGNALS;

        try {
            const language = this.decide(await this.engine.detect(code), minimumConfidence);
            if (language) {
                return {language: language.language, confidence: language.score, source: "betlang"};
            }
        } catch (error) {
            this.onEngineError(error);
        }

        const language = this.rules.detect(code);
        if (language) {
            return {language, source: "rule"};
        }
        return;
    }

    private decide(scores: LanguageScore[], minimumConfidence: number): LanguageScore | undefined {
        const confirmed: LanguageScore[] = [];
        let pending: LanguageScore[] = [];
        for (const candidate of scores) {
            if (pending.length > 0 && pending[pending.length - 1].score - candidate.score >= CONFIDENCE_GAP) {
                confirmed.push(...pending);
                pending = [];
            }
            if (candidate.score < minimumConfidence) {
                break;
            }
            pending.push(candidate);
        }

        for (const candidate of confirmed) {
            const language = BETLANG_TO_HLJS[candidate.language];
            if (language && this.isLanguageAvailable(language)) {
                return {language, score: candidate.score};
            }
        }
        return;
    }
}
