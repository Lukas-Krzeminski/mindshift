/**
 * APA 7 reference list (plan §12 source audit, Nov 16).
 * `*text*` marks italics. status 'confirm' = details still to verify before the Nov 21 lock;
 * those entries are flagged in presenter/debug mode only.
 */

export interface Reference {
  id: string
  apa: string
  status: 'verified' | 'confirm'
  /** true = on the team's poster list; false = proposed gap-filler. */
  poster: boolean
  note?: string
}

export const REFERENCES: Reference[] = [
  {
    id: 'agrawal2023',
    poster: true,
    status: 'confirm',
    apa: 'Agrawal, M., Emanuel, E., Richards, B., Richards, W., Roddy, K., & Thambi, P. (2023). Assessment of psilocybin therapy for patients with cancer and major depression disorder. *JAMA Oncology*. https://doi.org/10.1001/jamaoncol.2023.0351',
    note: 'Research letter; confirm volume/issue/pages and author initials.',
  },
  {
    id: 'bader2024',
    poster: true,
    status: 'verified',
    apa: 'Bader, H., Farraj, H., Maghnam, J., & Abu Omar, Y. (2024). Investigating the therapeutic efficacy of psilocybin in advanced cancer patients: A comprehensive review and meta-analysis. *World Journal of Clinical Oncology, 15*(7), 908–919. https://doi.org/10.5306/wjco.v15.i7.908',
  },
  {
    id: 'bellman2024',
    poster: true,
    status: 'verified',
    apa: 'Bellman, V. (2024). Review of psilocybin use for depression among cancer patients after approval in Oregon. *Cancers, 16*(9), Article 1702. https://doi.org/10.3390/cancers16091702',
  },
  {
    id: 'bmc2025',
    poster: true,
    status: 'confirm',
    apa: '[Authors to confirm]. (2025). The effects of psilocybin on psychological distress in cancer patients: A systematic review and meta-analysis. *BMC Psychology*. https://doi.org/10.1186/s40359-025-03935-y',
    note: 'Publisher blocked automated access; team to confirm authors, volume, article number.',
  },
  {
    id: 'johnson2008',
    poster: false,
    status: 'verified',
    apa: 'Johnson, M. W., Richards, W. A., & Griffiths, R. R. (2008). Human hallucinogen research: Guidelines for safety. *Journal of Psychopharmacology, 22*(6), 603–620.',
    note: 'Gap-filler (preparation, monitors, setting). "Move toward it" wording not yet verified in full text.',
  },
  {
    id: 'madsen2019',
    poster: false,
    status: 'confirm',
    apa: 'Madsen, M. K., Fisher, P. M., Burmester, D., et al. (2019). Psychedelic effects of psilocybin correlate with serotonin 2A receptor occupancy and plasma psilocin levels. *Neuropsychopharmacology, 44*, 1328–1334. https://doi.org/10.1038/s41386-019-0324-9',
    note: 'Gap-filler; expand the author list to APA 7 (up to 20 authors).',
  },
  {
    id: 'rosa2025',
    poster: true,
    status: 'confirm',
    apa: 'Rosa, W. E., Napolitano, S., McAndrew, N., et al. (2025). Meaning-centered psychotherapy for psilocybin-assisted therapy among patients with advanced cancer and depression: Rationale and preliminary evaluation of MCP-PSIL. https://doi.org/10.1177/28314425251363983',
    note: 'Confirm journal name (likely Psychedelic Medicine), volume, pages, full author list. No efficacy data.',
  },
  {
    id: 'ross2016',
    poster: true,
    status: 'confirm',
    apa: 'Ross, S., Bossis, A., Guss, J., et al. (2016). Rapid and sustained symptom reduction following psilocybin treatment for anxiety and depression in patients with life-threatening cancer: A randomized controlled trial. *Journal of Psychopharmacology, 30*(12), 1165–1180. https://doi.org/10.1177/0269881116675512',
    note: 'Expand the author list to APA 7.',
  },
  {
    id: 'science2026',
    poster: true,
    status: 'confirm',
    apa: '[Authors to confirm], & Amit, M. (2026). Psilocybin prevents chemotherapy-induced peripheral neuropathy through mitochondrial trafficking preservation. *Science, 393*(6815). https://doi.org/10.1126/science.aec6116',
    note: 'Preclinical (mice + cultured human nerve tissue). Never presented as a human treatment.',
  },
  {
    id: 'siegel2024',
    poster: false,
    status: 'confirm',
    apa: 'Siegel, J. S., Subramanian, S., Perry, D., et al. (2024). Psilocybin desynchronizes the human brain. *Nature, 632*, 131–138. https://doi.org/10.1038/s41586-024-07624-5',
    note: 'Gap-filler; healthy adults (n = 7). Expand the author list to APA 7.',
  },
]
