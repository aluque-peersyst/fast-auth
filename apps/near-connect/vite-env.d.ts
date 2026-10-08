/// <reference types="vite/client" />

interface Window {
    selector: {
        providers: { mainnet: string[]; testnet: string[] };
        location: string;

        outerWidth: number;
        outerHeight: number;
        screenX: number;
        screenY: number;

        ready: (wallet: any) => void;

        ui: {
            whenApprove: (options: { title: string; button: string }) => Promise<void>;
            showIframe: () => void;
            hideIframe: () => void;
        };

        open: (
            url: string,
            newTab?: boolean | string,
            options?: string,
        ) => {
            close: () => void;
            windowIdPromise: Promise<string | null>;
            closed: boolean;
        };

        storage: {
            set: (key: string, value: string) => Promise<void>;
            get: (key: string) => Promise<string>;
            remove: (key: string) => Promise<void>;
        };
    };
}
