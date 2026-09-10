import {
    Plugin,
    showMessage,
} from "siyuan";
import type zhCN from "./i18n/zh-CN.json";
import "./index.scss";

const STORAGE_NAME = "config.json";

export default class JCPlugin extends Plugin {
    declare i18n: typeof zhCN;

    onload() {
        this.loadData(STORAGE_NAME).catch(e => {
            const errorMessage = `${this.displayName}: failed to load data [${STORAGE_NAME}]: ${e.msg}`;
            showMessage(errorMessage);
            console.error(errorMessage);
        });

        console.log(this.displayName, "plugin loaded");
    }

    onLayoutReady() {
        console.log(this.displayName, "plugin layout ready");
    }

    onunload() {
        console.log(this.displayName, "plugin unloaded");
    }

    uninstall() {
        this.removeData(STORAGE_NAME).catch(e => {
            const errorMessage = `${this.displayName}: failed to uninstall remove data [${STORAGE_NAME}]: ${e.msg}`;
            showMessage(errorMessage);
            console.error(errorMessage);
        });

        console.log(this.displayName, "plugin uninstalled");
    }
}
