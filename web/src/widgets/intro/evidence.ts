/** Public reports that motivate the project. Shown in the intro's "Why now" list. */
export interface Evidence {
  readonly date: string;
  readonly headline: string;
  readonly source: string;
  readonly url: string;
}

export const EVIDENCE: readonly Evidence[] = [
  {
    date: 'Sep 2026',
    headline: 'Retailers start blocking AI shopping agents: Amazon shuts out Meta’s Muse',
    source: 'The Verge',
    url: 'https://www.theverge.com/report/1015811/ai-shopping-agents-blocked-amazon-the-realreal-target-meta-muse',
  },
  {
    date: 'Mar 2026',
    headline: 'Hidden prompts found in the wild trying to push agents into a $5,000 PayPal transfer, paid subscriptions and purchases',
    source: 'Palo Alto Networks Unit 42',
    url: 'https://unit42.paloaltonetworks.com/ai-agent-prompt-injection/',
  },
  {
    date: 'Mar 2026',
    headline: 'Warning: hidden instructions on deal sites can make shopping agents buy gift cards the user never asked for',
    source: 'Palo Alto Networks Unit 42',
    url: 'https://unit42.paloaltonetworks.com/retail-fraud-agentic-ai/',
  },
  {
    date: 'Nov 2025',
    headline: 'Microsoft’s simulated marketplace: prompt injection steered agents’ payments to manipulative sellers',
    source: 'The Register',
    url: 'https://www.theregister.com/2025/11/06/microsoft_unveils_the_magentic_marketplace/',
  },
  {
    date: 'Aug 2025',
    headline: 'An AI browser checked out on a fake Walmart store and autofilled the saved card without asking',
    source: 'Guardio Labs',
    url: 'https://guard.io/labs/scamlexity-we-put-agentic-ai-browsers-to-the-test-they-clicked-they-paid-they-failed',
  },
  {
    date: 'Feb 2025',
    headline: 'Asked only to find cheap eggs, OpenAI’s Operator bought them for $31 without confirmation',
    source: 'The Washington Post (via ADN)',
    url: 'https://www.adn.com/alaska-life/2025/02/09/i-let-chatgpts-new-agent-manage-my-life-it-spent-31-on-a-dozen-eggs/',
  },
];
