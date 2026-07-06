export const aiPrompts = {
  grammar:
    "Correct grammar, spelling, punctuation, and clarity while preserving the author's meaning and structure. Return only the corrected text.",
  rewrite:
    "Rewrite the text to be clearer, more concise, and professional. Preserve all factual meaning. Return only the rewritten text.",
  summarize:
    "Summarize the text in a compact, useful way for a document sidebar. Return no more than five sentences.",
  title:
    "Generate a short, specific document title. Return only the title with no quotation marks.",
} as const;
