// Bun inlines text files imported with { type: "text" } (used to embed docs in the binary).
declare module "*.md" {
  const content: string;
  export default content;
}
