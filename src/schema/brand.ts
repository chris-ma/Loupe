import { z } from "zod";

/**
 * Branding config — BR §7.3.
 *
 * "Branding must be config-driven from day one, even while the only brand in
 * the config is the operator's. Retrofitting this is the difference between a
 * report template and a licensable asset."
 *
 * Nothing in the template may read a colour, a typeface, a logo or a footer
 * from anywhere but this object. The default export below is the operator's
 * own brand and is the only brand that ships in the repo; a second brand is a
 * second config file, not a second template.
 */

const hexColour = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "must be a hex colour, e.g. #1a1a1a");

export const paletteSchema = z.object({
  /** Page background. */
  surface: hexColour,
  /** Slightly raised background for tables, callouts and the cover. */
  surfaceAlt: hexColour,
  /** Primary text. */
  ink: hexColour,
  /** Secondary text: captions, labels, methodology. */
  inkMuted: hexColour,
  /** Hairlines, table borders, dividers. */
  rule: hexColour,
  /** The one accent. Used for emphasis, not decoration. */
  accent: hexColour,
  /** Text drawn on top of `accent`. */
  onAccent: hexColour,
  /** Severity chips, keyed to the rubric's enumerated severities. */
  severity: z.object({
    critical: hexColour,
    high: hexColour,
    moderate: hexColour,
    low: hexColour,
  }),
});

export const typographySchema = z.object({
  /** CSS font stack for headings. Must end in a generic family. */
  headingStack: z.string().min(1),
  /** CSS font stack for body text. */
  bodyStack: z.string().min(1),
  /** CSS font stack for numbers, IDs and code-like values. */
  monoStack: z.string().min(1),
  /** Body size in points. Print, not screen. */
  basePt: z.number().min(7).max(14),
  baseLineHeight: z.number().min(1.1).max(2),
});

export const brandSchema = z.object({
  /** Brand config identifier, stamped in the footer alongside the versions. */
  key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  /** Name printed on the cover and in the footer. */
  name: z.string().min(1),
  /** One line under the name on the cover. */
  tagline: z.string().max(200).optional(),
  /**
   * Logo as an inline SVG string or a data URI. Kept inline so a report renders
   * with no network fetch and no asset host — the PDF route must be portable.
   */
  logo: z
    .object({
      svg: z.string().min(1).optional(),
      dataUri: z.string().startsWith("data:").optional(),
      /** Rendered width in millimetres on the cover. */
      widthMm: z.number().min(5).max(120).default(34),
      alt: z.string().min(1),
    })
    .refine((l) => Boolean(l.svg || l.dataUri), {
      message: "Logo must supply either an inline `svg` or a `dataUri`",
    })
    .optional(),
  palette: paletteSchema,
  typography: typographySchema,
  /** Left-hand footer text. Versions are appended automatically. */
  footer: z.string().min(1),
  /** Contact line on the cover and the closing page. */
  contact: z
    .object({
      email: z.string().email().optional(),
      website: z.string().min(1).optional(),
      abn: z.string().min(1).optional(),
    })
    .optional(),
  page: z
    .object({
      format: z.enum(["A4", "Letter"]).default("A4"),
      marginMm: z
        .object({ top: z.number(), right: z.number(), bottom: z.number(), left: z.number() })
        .default({ top: 18, right: 16, bottom: 20, left: 16 }),
    })
    .default({ format: "A4", marginMm: { top: 18, right: 16, bottom: 20, left: 16 } }),
});

export type Brand = z.infer<typeof brandSchema>;
export type Palette = z.infer<typeof paletteSchema>;

export function parseBrand(input: unknown): Brand {
  const result = brandSchema.safeParse(input);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Brand config is invalid:\n${detail}`);
  }
  return result.data;
}
