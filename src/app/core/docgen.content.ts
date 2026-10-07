import { DocgenPhase, DocgenStatus } from './docgen.models';

/** The steps shown in the instructions popup. */
export function instructionSteps(maxFileSizeMb: number): { title: string; text: string }[] {
  return [
    {
      title: 'Choose a PDF',
      text: `Drop it on the page or browse for it. One file at a time, up to ${maxFileSizeMb} MB.`,
    },
    {
      title: 'Accept the disclaimer',
      text: 'Select Generate document. Nothing is sent until you accept.',
    },
    {
      title: 'Follow the status',
      text: 'Queued, Processing and Retrying update live. Keep this tab open.',
    },
    {
      title: 'Download the draft',
      text: 'When the status reads Draft ready, download the .docx and review it.',
    },
  ];
}

/**
 * Body of the disclaimer popup.
 * TODO: replace with the wording approved by your legal team.
 */
export const DISCLAIMER_PARAGRAPHS: string[] = [
  'The .docx is an automated draft. It can contain errors or leave out content from the PDF. Review it before you rely on it.',
  'Your PDF is sent to the server for processing. Upload only files you are allowed to share.',
];

export const DISCLAIMER_ACCEPT_LABEL = 'I have read and accept the disclaimer';

/** Short disclaimer that stays visible on the page. */
export const DISCLAIMER_NOTE =
  'Drafts are generated automatically and can contain errors. Review the document before you use it.';

/** Headline and description for each phase. */
export const PHASE_COPY: Record<DocgenPhase, { title: string; text: string }> = {
  idle: {
    title: 'Standing by',
    text: 'Choose a PDF and select Generate document. Status updates appear here live.',
  },
  uploading: { title: 'Uploading', text: 'Sending your PDF to the server.' },
  queued: { title: 'Queued', text: 'Your PDF is uploaded and waiting for a free worker.' },
  processing: { title: 'Processing', text: 'Reading the PDF and building the Word document.' },
  retrying: {
    title: 'Retrying',
    text: 'The last attempt did not finish. Trying again automatically.',
  },
  ready: { title: 'Draft ready', text: 'Your Word draft is ready. Review it before you use it.' },
  failed: {
    title: 'Failed',
    text: 'The document could not be generated. Check the PDF and try again.',
  },
};

/** Note shown in the event log when the backend sends a status without a message. */
export const STATUS_NOTE: Record<DocgenStatus, string> = {
  QUEUED: 'Waiting for a free worker',
  PROCESSING: 'Reading the PDF',
  RETRYING: 'Last attempt did not finish',
  DRAFT_READY: 'Word draft is ready',
  FAILED: 'Generation stopped',
};
