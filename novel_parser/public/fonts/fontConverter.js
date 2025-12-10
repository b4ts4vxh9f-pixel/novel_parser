import fs from "fs";
import path from "path";
import decompress from 'woff2-encoder/decompress';

const FONTS_DIR = path.resolve("public/fonts");

if (!fs.existsSync(FONTS_DIR)) {
    console.error("public/fonts not found");
    process.exit(1);
}

const files = fs.readdirSync(FONTS_DIR);
const woff2Files = files.filter(f => f.endsWith(".woff2"));

export async function fontConvert() {
    for (const file of woff2Files) {
        const src = path.join(FONTS_DIR, file);
        const dst = path.join(FONTS_DIR, file.replace(".woff2", ".ttf"));

        console.log(`Converting: ${file} → ${path.basename(dst)}`);

        try {
            const fontFile = fs.readFileSync(src);
            const ttf = await decompress(fontFile);

            fs.writeFileSync(dst, ttf);
            console.log("✔ Conversion done.");

            // 🌟 Add the deletion step here 🌟
            fs.unlinkSync(src);
            console.log(`🗑 Deleted original file: ${file}`);
            // 🌟 ----------------------------- 🌟

        } catch (err) {
            console.error("❌ Failed:", err);
        }
    }
    console.log("All conversions and cleanup finished.");
}

await fontConvert();