/**
 * ALL on-screen story and science text lives here (plan §12), so the team can
 * review wording in one place. Source tags map to src/content/references.ts.
 * Status: DRAFT until the team locks the poster's papers (target Sat Nov 21).
 */

export interface Caption {
  id: string
  text: string
  /** Reference ids backing a factual claim ([] for fiction/story lines). */
  sources: string[]
}

export const CLINIC_CAPTIONS: Caption[] = [
  { id: 'C1', text: 'Alex, 46. Art teacher. Mother. Living with advanced cancer.', sources: [] },
  { id: 'C2', text: 'Since her diagnosis: anxiety, depression, and fear of what comes next.', sources: ['ross2016', 'agrawal2023'] },
  { id: 'C3', text: 'Today: a supervised research session testing psilocybin-assisted therapy.', sources: ['agrawal2023', 'johnson2008'] },
]

export const THERAPIST = {
  breatheIntro: 'Before we begin, breathe with me.',
  breatheAgain: 'Alex, you are safe. I am right here. Remember the breathing we practiced.',
  moveToward: 'If something frightening appears, move toward it.',
  integrationQuestion: 'What did you notice?',
}

export const LAB_LINES: Caption[] = [
  { id: 'L1', text: 'In the body, psilocybin becomes psilocin, which acts mainly on serotonin 5-HT2A receptors.', sources: ['madsen2019'] },
  { id: 'L2', text: 'For a while, brain networks communicate differently. (Brain-imaging studies in healthy volunteers.)', sources: ['siegel2024'] },
]

export const METAPHOR_TAG = 'Game metaphor, not a literal model of the brain.'

export const FICTION_DISCLAIMER =
  'In this game, finishing decides which world Alex enters. In reality, no test can predict how a psychedelic experience will go.'

export const ONE_POSSIBLE_EXPERIENCE = "One possible experience, not everyone's."

export const POSITIVE_THOUGHTS = {
  crayonSun: "I've been so afraid of leaving her that I stopped being with her.",
  palette: "I used to paint what I felt. I'd forgotten I could.",
  kite: "Maybe I don't need to hold everything so tightly.",
  tree: "I'm still scared. But I feel connected.",
}

export const CHALLENGING_THOUGHTS = [
  'What if it comes back?',
  "I'm not ready.",
  "I can't stop this.",
  'Why does everything feel so unfamiliar?',
  "I'm scared.",
]

export const CHALLENGING_RESOLUTION = {
  alex: "It's still hard. But I'm not alone in it.",
  tag: "Challenging experiences can be distressing. Support helps, but doesn't guarantee they resolve.",
}

export const INTEGRATION = {
  positive: "I'm still scared. But it doesn't own me.",
  challenging: 'That was hard. I want to understand it.',
  caption: { id: 'I1', text: 'Integration sessions help people make sense of what they experienced.', sources: ['rosa2025', 'johnson2008'] } as Caption,
}

export const TAKEAWAYS: Caption[] = [
  { id: 'R1', text: 'Cancer can bring serious anxiety, depression, and existential distress.', sources: ['ross2016', 'bader2024'] },
  { id: 'R2', text: 'Psilocybin becomes psilocin, which acts on 5-HT2A receptors; brain-network activity changes temporarily.', sources: ['madsen2019', 'siegel2024'] },
  { id: 'R3', text: 'Early trials in people with cancer found reductions in depression and anxiety, alongside preparation, supervision, and integration.', sources: ['agrawal2023', 'bader2024', 'bmc2025'] },
  { id: 'R4', text: "Studies are small and often lack placebo groups. Psilocybin does not treat cancer itself. Experiences can't be predicted, and neither a good nor a hard one guarantees an outcome.", sources: ['agrawal2023', 'bader2024', 'bmc2025'] },
]

export const CONTENT_NOTE =
  'This is a fictional story about serious illness. One scene uses intense, shifting colors (no rapid flashing).'
