import {
    fetchSyncPost,
    type IOperation,
    type IProtyle,
    ProtyleMethod,
} from "siyuan";
import type {RecognitionConfig} from "../config";
import type {LanguageDetector} from "../detector/LanguageDetector";

const CODE_BLOCK_SELECTOR = '[data-type="NodeCodeBlock"].code-block';
const LANGUAGE_SELECTOR = ".protyle-action__language";
const CONTENT_SELECTOR = ".hljs";

export interface RecognitionSummary {
    total: number;
    updated: number;
}

interface PreparedUpdate {
    block: HTMLElement;
    content: string;
    id: string;
    language: string;
    newHTML: string;
    oldHTML: string;
}

interface RecognizerOptions {
    detector: LanguageDetector;
    getConfig: () => RecognitionConfig;
    onError: (error: unknown) => void;
}

type UndoFocusContext = Record<string, string>;

interface PendingPaste {
    content: string;
    id: string;
    protyle: IProtyle;
    timer: number;
}

interface PendingNewCodeBlocks {
    candidates: Map<string, HTMLElement>;
    knownIds: Set<string>;
    protyle: IProtyle;
    timer: number;
}

export class CodeBlockRecognizer {
    private readonly detector: LanguageDetector;
    private readonly getConfig: () => RecognitionConfig;
    private readonly onError: (error: unknown) => void;
    private readonly observers = new Map<HTMLElement, MutationObserver>();
    private readonly inFlight = new Set<string>();
    private readonly pendingPastes = new Map<HTMLElement, Map<string, PendingPaste>>();
    private readonly pendingNewCodeBlocks = new Map<HTMLElement, PendingNewCodeBlocks>();

    constructor(options: RecognizerOptions) {
        this.detector = options.detector;
        this.getConfig = options.getConfig;
        this.onError = options.onError;
    }

    attach(protyle: IProtyle): void {
        const root = protyle.wysiwyg?.element;
        if (!(root instanceof HTMLElement) || this.observers.has(root)) {
            return;
        }

        const observer = new MutationObserver(mutations => {
            if (!this.pendingPastes.has(root) && !this.pendingNewCodeBlocks.has(root)) {
                return;
            }
            const blocks = new Set<HTMLElement>();
            for (const mutation of mutations) {
                this.collectBlocks(mutation.target, blocks);
                mutation.addedNodes.forEach(node => this.collectBlocks(node, blocks, true));
            }
            this.processPendingPastes(root, blocks);
            this.processPendingNewCodeBlocks(root, blocks);
        });
        observer.observe(root, {childList: true, characterData: true, subtree: true});
        this.observers.set(root, observer);
    }

    detach(protyle: IProtyle): void {
        const root = protyle.wysiwyg?.element;
        if (!(root instanceof HTMLElement)) {
            return;
        }
        this.observers.get(root)?.disconnect();
        this.observers.delete(root);
        this.clearPendingPastes(root);
        this.clearPendingNewCodeBlocks(root);
    }

    handlePaste(protyle: IProtyle): void {
        const config = this.getConfig();
        if (!config.enabled || !config.detectOnPaste || protyle.disabled) {
            return;
        }
        const root = protyle.wysiwyg?.element;
        if (!(root instanceof HTMLElement)) {
            return;
        }
        this.startPendingNewCodeBlocks(protyle, root);
        const block = this.getCurrentBlock(protyle);
        const id = block?.dataset.nodeId;
        const content = block?.querySelector<HTMLElement>(CONTENT_SELECTOR)?.textContent;
        if (!block || !id || content === undefined) {
            return;
        }
        let pending = this.pendingPastes.get(root);
        if (!pending) {
            pending = new Map();
            this.pendingPastes.set(root, pending);
        }
        const previous = pending.get(id);
        if (previous) {
            window.clearTimeout(previous.timer);
        }
        const state: PendingPaste = {
            content,
            id,
            protyle,
            timer: 0,
        };
        state.timer = window.setTimeout(() => this.finishPendingPaste(root, state), 5000);
        pending.set(id, state);
    }

    getCodeBlocks(blocks: HTMLElement[]): HTMLElement[] {
        const codeBlocks = new Map<string, HTMLElement>();
        blocks.forEach(block => {
            const descendants = Array.from(block.querySelectorAll<HTMLElement>(CODE_BLOCK_SELECTOR));
            const candidates = block.matches(CODE_BLOCK_SELECTOR) ? [block, ...descendants] : descendants;
            candidates.forEach(candidate => {
                const id = candidate.dataset.nodeId;
                if (id && !codeBlocks.has(id)) {
                    codeBlocks.set(id, candidate);
                }
            });
        });
        return Array.from(codeBlocks.values());
    }

    async recognizeCurrentOrSelected(protyle: IProtyle): Promise<RecognitionSummary> {
        const root = protyle.wysiwyg?.element;
        if (!(root instanceof HTMLElement)) {
            return {total: 0, updated: 0};
        }
        const selected = Array.from(root.querySelectorAll<HTMLElement>(".protyle-wysiwyg--select"));
        if (selected.length > 0) {
            return this.recognizeBlocks(protyle, this.getCodeBlocks(selected));
        }
        const block = this.getCurrentBlock(protyle);
        return block ? this.recognizeBlocks(protyle, [block]) : {total: 0, updated: 0};
    }

    async recognizeBlocks(protyle: IProtyle, blocks: HTMLElement[]): Promise<RecognitionSummary> {
        if (protyle.disabled) {
            return {total: 0, updated: 0};
        }
        const uniqueBlocks = Array.from(
            new Map(
                blocks.filter(block => block.matches(CODE_BLOCK_SELECTOR)).map(block => [
                    block.dataset.nodeId,
                    block,
                ]),
            ).values(),
        );
        const updates: PreparedUpdate[] = [];
        for (let index = 0; index < uniqueBlocks.length; index++) {
            const update = await this.prepareUpdate(uniqueBlocks[index]);
            if (update) {
                updates.push(update);
            }
            if (index > 0 && index % 8 === 0) {
                await new Promise<void>(resolve => window.setTimeout(resolve, 0));
            }
        }
        const validUpdates = updates.filter(update =>
            !update.block.isConnected ||
            update.block.querySelector<HTMLElement>(CONTENT_SELECTOR)?.textContent === update.content
        );
        if (validUpdates.length > 0) {
            this.commitUpdates(protyle, validUpdates);
        }
        return {total: uniqueBlocks.length, updated: validUpdates.length};
    }

    async recognizeDocument(protyle: IProtyle): Promise<RecognitionSummary> {
        const id = protyle.block.rootID ?? protyle.block.id;
        if (!id || protyle.disabled) {
            return {total: 0, updated: 0};
        }
        const response = await fetchSyncPost("/api/filetree/getDoc", {
            id,
            mode: 0,
            notebook: protyle.notebookId,
            size: 102400,
        });
        if (response.code !== 0 || typeof response.data?.content !== "string") {
            throw new Error(response.msg || `Failed to load document ${id}`);
        }
        const template = document.createElement("template");
        template.innerHTML = response.data.content;
        return this.recognizeBlocks(
            protyle,
            Array.from(template.content.querySelectorAll<HTMLElement>(CODE_BLOCK_SELECTOR)),
        );
    }

    destroy(): void {
        this.observers.forEach(observer => observer.disconnect());
        this.observers.clear();
        this.pendingPastes.forEach((_pending, root) => this.clearPendingPastes(root));
        this.pendingNewCodeBlocks.forEach((_pending, root) => this.clearPendingNewCodeBlocks(root));
        this.inFlight.clear();
    }

    private getCurrentBlock(protyle: IProtyle): HTMLElement | undefined {
        const root = protyle.wysiwyg?.element;
        const rangeNode = protyle.toolbar?.range?.startContainer;
        const selectionNode = window.getSelection()?.anchorNode;
        for (const node of [rangeNode, selectionNode]) {
            const element = node instanceof HTMLElement ? node : node?.parentElement;
            const block = element?.closest<HTMLElement>(CODE_BLOCK_SELECTOR);
            if (block && root?.contains(block)) {
                return block;
            }
        }
        return;
    }

    private collectBlocks(node: Node, blocks: Set<HTMLElement>, includeDescendants = false): void {
        const element = node instanceof HTMLElement ? node : node.parentElement;
        const block = element?.closest<HTMLElement>(CODE_BLOCK_SELECTOR);
        if (block) {
            blocks.add(block);
        }
        if (includeDescendants && element) {
            element.querySelectorAll<HTMLElement>(CODE_BLOCK_SELECTOR).forEach(item => blocks.add(item));
        }
    }

    private clearPendingPastes(root: HTMLElement): void {
        const pending = this.pendingPastes.get(root);
        pending?.forEach(state => window.clearTimeout(state.timer));
        this.pendingPastes.delete(root);
    }

    private clearPendingNewCodeBlocks(root: HTMLElement): void {
        const pending = this.pendingNewCodeBlocks.get(root);
        if (pending) {
            window.clearTimeout(pending.timer);
            this.pendingNewCodeBlocks.delete(root);
        }
    }

    private startPendingNewCodeBlocks(protyle: IProtyle, root: HTMLElement): void {
        this.clearPendingNewCodeBlocks(root);
        const state: PendingNewCodeBlocks = {
            candidates: new Map(),
            knownIds: new Set(
                Array.from(root.querySelectorAll<HTMLElement>(CODE_BLOCK_SELECTOR)).flatMap(block =>
                    block.dataset.nodeId ? [block.dataset.nodeId] : []
                ),
            ),
            protyle,
            timer: 0,
        };
        state.timer = window.setTimeout(() => this.finishPendingNewCodeBlocks(root, state), 5000);
        this.pendingNewCodeBlocks.set(root, state);
    }

    private finishPendingNewCodeBlocks(root: HTMLElement, state: PendingNewCodeBlocks): void {
        if (this.pendingNewCodeBlocks.get(root) !== state) {
            return;
        }
        this.pendingNewCodeBlocks.delete(root);
        state.candidates.forEach((block, id) => {
            const liveBlock = block.isConnected ? block : this.findBlock(root, id);
            if (liveBlock) {
                void this.recognize(state.protyle, liveBlock);
            }
        });
    }

    private processPendingNewCodeBlocks(root: HTMLElement, blocks: Set<HTMLElement>): void {
        const state = this.pendingNewCodeBlocks.get(root);
        if (!state) {
            return;
        }
        let changed = false;
        blocks.forEach(block => {
            const id = block.dataset.nodeId;
            if (!id || state.knownIds.has(id)) {
                return;
            }
            state.candidates.set(id, block);
            changed = true;
        });
        if (changed) {
            window.clearTimeout(state.timer);
            state.timer = window.setTimeout(() => this.finishPendingNewCodeBlocks(root, state), 150);
        }
    }

    private findBlock(root: HTMLElement, id: string): HTMLElement | undefined {
        return Array.from(root.querySelectorAll<HTMLElement>(CODE_BLOCK_SELECTOR)).find(block =>
            block.dataset.nodeId === id
        );
    }

    private finishPendingPaste(root: HTMLElement, state: PendingPaste): void {
        const pending = this.pendingPastes.get(root);
        if (pending?.get(state.id) !== state) {
            return;
        }
        pending.delete(state.id);
        if (pending.size === 0) {
            this.pendingPastes.delete(root);
        }
        const block = this.findBlock(root, state.id);
        const content = block?.querySelector<HTMLElement>(CONTENT_SELECTOR)?.textContent;
        if (block && content !== undefined && content !== state.content) {
            void this.recognize(state.protyle, block);
        }
    }

    private processPendingPastes(root: HTMLElement, blocks: Set<HTMLElement>): void {
        const pending = this.pendingPastes.get(root);
        if (!pending) {
            return;
        }
        blocks.forEach(block => {
            const id = block.dataset.nodeId;
            const state = id ? pending.get(id) : undefined;
            const content = block.querySelector<HTMLElement>(CONTENT_SELECTOR)?.textContent;
            if (!state || content === undefined || content === state.content) {
                return;
            }
            window.clearTimeout(state.timer);
            state.timer = window.setTimeout(() => this.finishPendingPaste(root, state), 150);
        });
    }

    private async recognize(protyle: IProtyle, block: HTMLElement): Promise<void> {
        const config = this.getConfig();
        const id = block.dataset.nodeId;
        const languageElement = block.querySelector<HTMLElement>(LANGUAGE_SELECTOR);
        const contentElement = block.querySelector<HTMLElement>(CONTENT_SELECTOR);
        const originalLanguage = languageElement?.textContent?.trim() ?? "";
        const language = originalLanguage.toLowerCase();
        if (
            !config.enabled || protyle.disabled || !block.isConnected || !id || !languageElement || !contentElement ||
            language !== "" || this.inFlight.has(id)
        ) {
            return;
        }

        const content = contentElement.textContent ?? "";
        this.inFlight.add(id);
        try {
            const result = await this.detector.detect(content);
            if (
                !result || !block.isConnected || (contentElement.textContent ?? "") !== content ||
                languageElement.textContent?.trim() !== originalLanguage
            ) {
                return;
            }
            this.applyLanguage(protyle, block, contentElement, languageElement, content, result.language);
        } catch (error) {
            this.onError(error);
        } finally {
            this.inFlight.delete(id);
        }
    }

    private async prepareUpdate(block: HTMLElement): Promise<PreparedUpdate | undefined> {
        const id = block.dataset.nodeId;
        const languageElement = block.querySelector<HTMLElement>(LANGUAGE_SELECTOR);
        const contentElement = block.querySelector<HTMLElement>(CONTENT_SELECTOR);
        if (!id || !languageElement || !contentElement || this.inFlight.has(id)) {
            return;
        }
        const content = contentElement.textContent ?? "";
        this.inFlight.add(id);
        try {
            const result = await this.detector.detect(content);
            if (!result || languageElement.textContent?.trim().toLowerCase() === result.language.toLowerCase()) {
                return;
            }
            const clone = block.cloneNode(true) as HTMLElement;
            const cloneLanguage = clone.querySelector<HTMLElement>(LANGUAGE_SELECTOR);
            const cloneContent = clone.querySelector<HTMLElement>(CONTENT_SELECTOR);
            if (!cloneLanguage || !cloneContent) {
                return;
            }
            this.preparePersistedLanguage(cloneContent, cloneLanguage, content, result.language);
            return {block, content, id, language: result.language, newHTML: clone.outerHTML, oldHTML: block.outerHTML};
        } finally {
            this.inFlight.delete(id);
        }
    }

    private commitUpdates(protyle: IProtyle, updates: PreparedUpdate[]): void {
        const root = protyle.wysiwyg?.element;
        const focusContext = this.captureUndoFocusContext(protyle, new Set(updates.map(update => update.id)));
        updates.forEach(update => {
            const liveBlock = root?.querySelector<HTMLElement>(`[data-node-id="${update.id}"]`);
            const liveLanguage = liveBlock?.querySelector<HTMLElement>(LANGUAGE_SELECTOR);
            const liveContent = liveBlock?.querySelector<HTMLElement>(CONTENT_SELECTOR);
            if (liveLanguage && liveContent) {
                this.renderLanguage(liveBlock, liveContent, liveLanguage, update.language);
            }
        });
        const doOperations: IOperation[] = updates.map((update, index) => ({
            action: "update",
            id: update.id,
            data: update.newHTML,
            context: index === 0 ? focusContext : undefined,
        }));
        const undoOperations: IOperation[] = updates.map((update, index) => ({
            action: "update",
            id: update.id,
            data: update.oldHTML,
            context: index === 0 ? focusContext : undefined,
        }));
        protyle.getInstance().transaction(doOperations, undoOperations);
    }

    private getCodeElement(contentElement: HTMLElement): HTMLElement {
        return contentElement.querySelector<HTMLElement>('[contenteditable="true"]') ??
            contentElement.lastElementChild as HTMLElement | null ?? contentElement;
    }

    private getActiveRange(protyle: IProtyle): Range | undefined {
        const root = protyle.wysiwyg?.element;
        if (!(root instanceof HTMLElement)) {
            return;
        }
        const selection = window.getSelection();
        if (selection?.rangeCount) {
            const range = selection.getRangeAt(0);
            if (root.contains(range.startContainer) && root.contains(range.endContainer)) {
                return range.cloneRange();
            }
        }
        const range = protyle.toolbar?.range;
        if (range && root.contains(range.startContainer) && root.contains(range.endContainer)) {
            return range.cloneRange();
        }
        return;
    }

    private getTextOffset(element: HTMLElement, container: Node, offset: number): number {
        const range = document.createRange();
        range.selectNodeContents(element);
        range.setEnd(container, offset);
        const fragment = range.cloneContents();
        return range.toString().split("\u200b").join("").length +
            fragment.querySelectorAll("br, .emoji").length;
    }

    private captureUndoFocusContext(protyle: IProtyle, affectedIds: Set<string>): UndoFocusContext | undefined {
        const root = protyle.wysiwyg?.element;
        const range = this.getActiveRange(protyle);
        if (!(root instanceof HTMLElement) || !range) {
            return;
        }
        const startElement = range.startContainer instanceof HTMLElement ?
            range.startContainer :
            range.startContainer.parentElement;
        const endElement = range.endContainer instanceof HTMLElement ?
            range.endContainer :
            range.endContainer.parentElement;
        const startBlock = startElement?.closest<HTMLElement>(CODE_BLOCK_SELECTOR);
        const endBlock = endElement?.closest<HTMLElement>(CODE_BLOCK_SELECTOR);
        const id = startBlock?.dataset.nodeId;
        if (!startBlock || startBlock !== endBlock || !id || !affectedIds.has(id)) {
            return;
        }
        const contentElement = startBlock.querySelector<HTMLElement>(CONTENT_SELECTOR);
        if (!contentElement) {
            return;
        }
        const codeElement = this.getCodeElement(contentElement);
        if (!codeElement.contains(range.startContainer) || !codeElement.contains(range.endContainer)) {
            return;
        }
        const blockInstances = Array.from(root.querySelectorAll<HTMLElement>(`[data-node-id="${id}"]`));
        const blockIndex = blockInstances.indexOf(startBlock).toString();
        const start = this.getTextOffset(codeElement, range.startContainer, range.startOffset);
        const end = this.getTextOffset(codeElement, range.endContainer, range.endOffset);
        const textLength = codeElement.textContent?.split("\u200b").join("").length ?? 0;
        return {
            undoFocusId: id,
            undoFocusIndex: blockIndex,
            undoFocusStart: start.toString(),
            undoFocusStartAtEnd: (start === textLength).toString(),
            undoFocusEndId: id,
            undoFocusEndIndex: blockIndex,
            undoFocusEnd: end.toString(),
            undoFocusIgnoreZWSP: "true",
        };
    }

    private preparePersistedLanguage(
        contentElement: HTMLElement,
        languageElement: HTMLElement,
        content: string,
        language: string,
    ): void {
        languageElement.textContent = language;
        this.getCodeElement(contentElement).textContent = content;
        contentElement.removeAttribute("data-render");
    }

    private insertCursorMarker(element: HTMLElement): void {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return;
        }
        const selectionRange = selection.getRangeAt(0);
        if (!element.contains(selectionRange.startContainer)) {
            return;
        }
        const markerRange = selectionRange.cloneRange();
        markerRange.collapse(true);
        markerRange.insertNode(document.createElement("wbr"));
    }

    private renderLanguage(
        block: HTMLElement,
        contentElement: HTMLElement,
        languageElement: HTMLElement,
        language: string,
    ): void {
        languageElement.textContent = language;
        this.insertCursorMarker(this.getCodeElement(contentElement));
        contentElement.removeAttribute("data-render");
        ProtyleMethod.highlightRender(block);
    }

    private applyLanguage(
        protyle: IProtyle,
        block: HTMLElement,
        contentElement: HTMLElement,
        languageElement: HTMLElement,
        content: string,
        language: string,
    ): void {
        const id = block.dataset.nodeId;
        if (!id) {
            return;
        }
        const oldHTML = block.outerHTML;
        const focusContext = this.captureUndoFocusContext(protyle, new Set([id]));
        const clone = block.cloneNode(true) as HTMLElement;
        const cloneLanguage = clone.querySelector<HTMLElement>(LANGUAGE_SELECTOR);
        const cloneContent = clone.querySelector<HTMLElement>(CONTENT_SELECTOR);
        if (!cloneLanguage || !cloneContent) {
            return;
        }
        this.preparePersistedLanguage(cloneContent, cloneLanguage, content, language);
        this.renderLanguage(block, contentElement, languageElement, language);
        const doOperations: IOperation[] = [{action: "update", id, data: clone.outerHTML, context: focusContext}];
        const undoOperations: IOperation[] = [{action: "update", id, data: oldHTML, context: focusContext}];
        protyle.getInstance().transaction(doOperations, undoOperations);
    }
}
