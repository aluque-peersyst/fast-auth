import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// VARIANT=local or VARIANT=demo builds src/near-auth with the modules in src/near-auth-<variant> swapped in.
const variant = process.env.VARIANT;
const wallet = path.resolve(__dirname, "src/near-auth");
const variantDir = variant ? path.resolve(__dirname, `src/near-auth-${variant}`) : undefined;
if (variantDir && !existsSync(variantDir)) throw new Error(`Unknown VARIANT "${variant}": ${variantDir} does not exist`);

/** Serves the wallet's own `./x` imports from the variant folder when it has an `x.ts`. */
const overrides: Plugin = {
    name: "near-auth-overrides",
    enforce: "pre",
    resolveId(source, importer) {
        if (!variantDir || !importer || path.dirname(importer) !== wallet || !source.startsWith("./")) return null;
        const override = path.join(variantDir, `${source.slice(2)}.ts`);
        return existsSync(override) ? override : null;
    },
};

export default defineConfig({
    plugins: [nodePolyfills(), overrides],
    build: {
        outDir: `dist/${variant ?? "production"}`,
        rollupOptions: {
            input: { main: "./src/near-auth" },
            output: {
                entryFileNames: "connector/near-connect.js",
                format: "iife",
            },
        },
    },
    // NEAR Connect downloads the script from the dapp's page, so any origin may read it.
    preview: {
        port: 8080,
        strictPort: true,
        cors: { origin: "*" },
    },
});
