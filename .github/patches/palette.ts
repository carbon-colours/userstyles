import { hexToCSSFilter } from "npm:hex-to-css-filter@7.0.0";

const root = new URL("../../", import.meta.url);

const paletteUrl = `https://raw.githubusercontent.com/carbon-colours/palette/main/palette.json`;

const check = Deno.args.includes("--check");
const input = Deno.args.find((arg) => arg !== "--check");

const raw = input
  ? await Deno.readTextFile(input)
  : await fetch(paletteUrl).then((response) => {
      if (!response.ok) {
        throw new Error(`Palette download: ${response.status}`);
      }
      return response.text();
    });

const palette = JSON.parse(raw);

const names = [
  "rosewater",
  "flamingo",
  "pink",
  "mauve",
  "red",
  "maroon",
  "peach",
  "yellow",
  "green",
  "teal",
  "sky",
  "sapphire",
  "blue",
  "lavender",
  "text",
  "subtext1",
  "subtext0",
  "overlay2",
  "overlay1",
  "overlay0",
  "surface2",
  "surface1",
  "surface0",
  "base",
  "mantle",
  "crust",
];

const aliases = {
  latte: "light",
  frappe: "dark",
  macchiato: "dark",
  mocha: "dark",
} as const;

for (const mode of ["light", "dark"]) {
  const colors = palette[mode]?.colors;

  if (
    !colors ||
    names.some((name) => !/^#[0-9a-f]{6}$/i.test(colors[name]?.hex ?? ""))
  ) {
    throw new Error(`Missing or invalid ${mode} colours`);
  }

  if (
    Object.keys(colors).some(
      (name) => name !== "monochrome" && !names.includes(name),
    )
  ) {
    throw new Error(`Unexpected colour in ${mode}`);
  }
}

// seed the solver so unchanged colours produce unchanged output
function seeded(hex: string) {
  let state = parseInt(hex.slice(1), 16);

  return () => {
    state = (state + 0x6d2b79f5) | 0;

    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const filters = new Map<string, string>();

function makeFilter(hex: string): string {
  const cached = filters.get(hex);
  if (cached) return cached;

  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

  let value: string;

  if (rgb[0] === rgb[1] && rgb[1] === rgb[2]) {
    // grays do not need an approximate solver
    const invert = ((rgb[0] / 255) * 100).toFixed(6);
    value = `brightness(0) saturate(100%) invert(${invert}%)`;
  } else {
    const random = Math.random;
    let best: ReturnType<typeof hexToCSSFilter> | undefined;

    try {
      Math.random = seeded(hex);

      for (let attempt = 0; attempt < 12; attempt++) {
        const result = hexToCSSFilter(hex, {
          acceptanceLossPercentage: 1,
          maxChecks: 100,
          forceFilterRecalculation: true,
        });

        if (!best || result.loss < best.loss) {
          best = result;
        }

        if (best.loss <= 1) break;
      }
    } finally {
      Math.random = random;
    }

    if (!best || !Number.isFinite(best.loss) || best.loss > 2) {
      throw new Error(`Filter approximation failed for ${hex}: ${best?.loss}`);
    }

    const [i, s, sat, h, b, c] = best.values;

    value =
      `brightness(0) saturate(100%) invert(${i.toFixed(6)}%) ` +
      `sepia(${s.toFixed(6)}%) saturate(${sat.toFixed(6)}%) ` +
      `hue-rotate(${(h * 3.6).toFixed(6)}deg) ` +
      `brightness(${b.toFixed(6)}%) contrast(${c.toFixed(6)}%)`;
  }

  filters.set(hex, value);
  return value;
}

function makeBlock(name: string, useFilters: boolean): string {
  const rows = Object.entries(aliases).map(([alias, mode]) => {
    const values = names.map((label) => {
      const hex = palette[mode].colors[label].hex.toLowerCase();
      return `@${label}: ${useFilters ? makeFilter(hex) : hex}`;
    });

    return `  @${alias}: { ${values.join("; ")}; };`;
  });

  return `@${name}: {\n${rows.join("\n")}\n};`;
}

function replaceBlock(
  source: string,
  name: string,
  replacement: string,
): string {
  const pattern = new RegExp(`^@${name}:\\s*\\{[\\s\\S]*?^\\};`, "gm");

  const matches = [...source.matchAll(pattern)];

  if (matches.length !== 1) {
    throw new Error(`Expected one @${name} block`);
  }

  for (const alias of Object.keys(aliases)) {
    const rows = matches[0][0].match(new RegExp(`^\\s*@${alias}:`, "gm"));

    if (rows?.length !== 1) {
      throw new Error(`Expected one ${alias} entry in @${name}`);
    }
  }

  return source.replace(pattern, () => replacement);
}

const library = new URL("lib/std/v1.less", root);
const original = await Deno.readTextFile(library);

let updated = replaceBlock(
  original,
  "catppuccin",
  makeBlock("catppuccin", false),
);

updated = replaceBlock(
  updated,
  "catppuccin-filters",
  makeBlock("catppuccin-filters", true),
);

const changes: {
  path: URL;
  before: string;
  after: string;
}[] = [{ path: library, before: original, after: updated }];

const styles = [new URL("template/catppuccin.user.less", root)];

for await (const entry of Deno.readDir(new URL("styles/", root))) {
  if (entry.isDirectory) {
    styles.push(new URL(`styles/${entry.name}/catppuccin.user.less`, root));
  }
}

for (const path of styles) {
  const before = await Deno.readTextFile(path);
  let count = 0;

  const after = before.replace(
    /^(@var\s+select\s+(lightFlavor|darkFlavor)\s+"[^"]*"\s+)\[[^\]\r\n]*\]/gm,
    (_, prefix: string, variable: string) => {
      count++;

      return (
        prefix +
        (variable === "lightFlavor"
          ? '["latte:Light*", "mocha:Dark"]'
          : '["latte:Light", "mocha:Dark*"]')
      );
    },
  );

  if (count !== 2) {
    throw new Error(`Expected two flavour selectors in ${path.pathname}`);
  }

  changes.push({ path, before, after });
}

// validate and generate everything before modifying files
const changed = changes.filter(({ before, after }) => before !== after);

if (check) {
  if (changed.length) {
    throw new Error(
      `Generated files are stale: ${changed
        .map((x) => x.path.pathname)
        .join(", ")}`,
    );
  }

  console.log("Palette, filters, and selectors are current.");
} else {
  for (const { path, after } of changed) {
    await Deno.writeTextFile(path, after);
  }

  console.log(`Updated ${changed.length} files.`);
}
