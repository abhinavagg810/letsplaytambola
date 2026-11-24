/** Structured data for search engines, as the Next.js JSON-LD guide recommends: `<` is escaped so no text can close the script. */
export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}
