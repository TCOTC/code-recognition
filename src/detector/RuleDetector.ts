interface LanguageRule {
    language: string;
    patterns: RegExp[];
}

const RULES: LanguageRule[] = [
    {
        language: "protobuf",
        patterns: [
            /\bsyntax\s*=\s*"proto[23]"\s*;/,
            /\b(?:message|enum|service|rpc|oneof)\s+\w+/,
            /\b(?:repeated|optional|required)\s+[\w.<>]+/,
        ],
    },
    {
        language: "wasm",
        patterns: [
            /^\s*\(\s*(?:module|func|memory|table|type|import|export)\b/m,
            /\(local\.|\bi32\.|\bi64\.|\bf32\./,
            /^\s*\((?:param|result|local|global)\b/m,
        ],
    },
    {
        language: "scss",
        patterns: [/\$[\w-]+\s*:/, /@(?:mixin|include|extend|use|forward|each|function)\b/, /%(?:[\w-]+)\s*\{/],
    },
    {language: "less", patterns: [/@[\w-]+\s*:/, /\.[\w-]+\s*\(\s*@/, /@(?:plugin|import)\b/]},
    {
        language: "tcl",
        patterns: [
            /^\s*proc\s+[\w:]+/m,
            /\b(?:puts|llength|lindex|lappend|expr|foreach|catch)\b/,
            /\[\s*(?:expr|string|list|llength|lindex)\b/,
        ],
    },
    {
        language: "awk",
        patterns: [/^\s*(?:BEGIN|END)\s*\{/m, /\b(?:printf?|split|substr|gsub|NF|NR|FS|OFS)\b/, /^\s*#!.*\bawk\b/m],
    },
    {language: "diff", patterns: [/^diff --git /m, /^@@\s+-\d+/m, /^(?:---|\+\+\+)\s+\S+/m]},
    {
        language: "handlebars",
        patterns: [/\{\{[#/>]?\w[\w.]*/, /\{\{\/[^}]+\}\}/, /\{\{\s*(?:else|each|if|unless|with)\b/],
    },
    {language: "erb", patterns: [/<%[-=]?/, /%>/, /<%=?\s*(?:if|each|end|else|render)\b/]},
    {
        language: "vim",
        patterns: [
            /^\s*(?:set|setlocal|let|map|nnoremap|autocmd|function!?|augroup)\b/m,
            /<(?:CR|Esc|Leader|silent|buffer)>/i,
            /\b(?:g:|s:|b:|w:|a:)\w+/,
        ],
    },
    {
        language: "graphql",
        patterns: [
            /\b(?:type|query|mutation|subscription|fragment|scalar|interface|input|enum|union)\s+[A-Z]\w*\s*[{(:]/,
            /\bextend\s+type\b/,
            /^\s*schema\s*\{/m,
        ],
    },
    {language: "coffeescript", patterns: [/->|=>/, /\b(?:isnt|unless|until|then)\b/, /^\s*@\w+\s*=/m]},
    {
        language: "fortran",
        patterns: [
            /\b(?:PROGRAM|SUBROUTINE|IMPLICIT\s+NONE|END\s+PROGRAM)\b/i,
            /^\s*(?:INTEGER|REAL|CHARACTER)\s*(?:::)\s*\w+/im,
        ],
    },
    {language: "ada", patterns: [/\b(?:procedure|package\s+body)\s+\w+/i, /\bwith\s+[\w.]+\s*;/i, /\bend\s+\w+\s*;/i]},
    {language: "pascal", patterns: [/\bprogram\s+\w+\s*;/i, /\bbegin\b[\s\S]*\bend\./i, /\bvar\s+\w+\s*:\s*\w+/i]},
    {language: "matlab", patterns: [/^\s*function\b/m, /\b(?:clc|clear\s+all|disp)\s*\(/, /^\s*%[^%]/m]},
    {language: "nginx", patterns: [/\b(?:server|location|upstream)\s*[^;]*\{/, /\b(?:proxy_pass|listen)\s+[^;]+;/]},
    {
        language: "glsl",
        patterns: [/#version\s+\d+/, /\bgl_Position\b/, /\buniform\s+(?:vec[234]|mat[234]|sampler\w*)\b/],
    },
    {language: "nim", patterns: [/\b(?:proc|func|template|macro)\s+\w+.*\s*=/, /\becho\s+"/]},
];

export class RuleDetector {
    constructor(private readonly isLanguageAvailable: (language: string) => boolean) {
    }

    detect(source: string): string | undefined {
        let best: {language: string; score: number;} | undefined;
        let secondScore = 0;
        for (const rule of RULES) {
            if (!this.isLanguageAvailable(rule.language)) {
                continue;
            }
            const score = rule.patterns.reduce((total, pattern) => total + Number(pattern.test(source)), 0);
            if (!best || score > best.score) {
                secondScore = best?.score ?? 0;
                best = {language: rule.language, score};
            } else if (score > secondScore) {
                secondScore = score;
            }
        }
        return best && best.score >= 2 && best.score - secondScore >= 1 ? best.language : undefined;
    }
}
