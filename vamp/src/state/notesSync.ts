/* Pure (Firebase-free) so the no-loss rule stays unit-testable: never delete the parent's
   notes field unless the subcollection already has them or we're writing them this pass. */

export interface NotesReconcileInput {
  subExists: boolean;
  /* Cloud copy wins over local, i.e. no unsynced local edits to preserve. */
  cloudAuthoritative: boolean;
  parentHasNotesField: boolean;
}

export interface NotesReconcilePlan {
  adoptSubNotes: boolean;
  writeSub: boolean;
  deleteParentField: boolean;
}

export function planNotesReconcile(i: NotesReconcileInput): NotesReconcilePlan {
  if (i.subExists) {
    return { adoptSubNotes: i.cloudAuthoritative, writeSub: false, deleteParentField: i.parentHasNotesField };
  }
  return { adoptSubNotes: false, writeSub: true, deleteParentField: i.parentHasNotesField };
}
