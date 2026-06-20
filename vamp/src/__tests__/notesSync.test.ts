import { describe, it, expect } from 'vitest';
import { planNotesReconcile } from '../state/notesSync';

describe('planNotesReconcile', () => {
  it('legacy doc, no subcollection: migrate then delete parent field', () => {
    expect(planNotesReconcile({ subExists: false, cloudAuthoritative: true, parentHasNotesField: true }))
      .toEqual({ adoptSubNotes: false, writeSub: true, deleteParentField: true });
  });

  it('fresh local notes, no subcollection: write them up, nothing to delete', () => {
    expect(planNotesReconcile({ subExists: false, cloudAuthoritative: false, parentHasNotesField: false }))
      .toEqual({ adoptSubNotes: false, writeSub: true, deleteParentField: false });
  });

  it('subcollection exists, cloud fresher: adopt it, no write', () => {
    expect(planNotesReconcile({ subExists: true, cloudAuthoritative: true, parentHasNotesField: false }))
      .toEqual({ adoptSubNotes: true, writeSub: false, deleteParentField: false });
  });

  it('subcollection exists, local fresher: keep local, no write', () => {
    expect(planNotesReconcile({ subExists: true, cloudAuthoritative: false, parentHasNotesField: false }))
      .toEqual({ adoptSubNotes: false, writeSub: false, deleteParentField: false });
  });

  it('subcollection exists with a stray legacy parent field: clean it up', () => {
    expect(planNotesReconcile({ subExists: true, cloudAuthoritative: true, parentHasNotesField: true }).deleteParentField)
      .toBe(true);
  });

  /* The invariant: parent field is only ever deleted when the sub already holds notes
     or we are writing them this pass. */
  it('never deletes the parent field without a backing sub write or existing sub', () => {
    for (const subExists of [true, false]) {
      for (const cloudAuthoritative of [true, false]) {
        for (const parentHasNotesField of [true, false]) {
          const p = planNotesReconcile({ subExists, cloudAuthoritative, parentHasNotesField });
          if (p.deleteParentField) expect(subExists || p.writeSub).toBe(true);
        }
      }
    }
  });
});
