import type { Ref } from 'react';
import type { ContactMatch, MatchableContact } from '@/lib/contacts/duplicates';
import type { FormField } from '@/lib/contacts/form-rules';
import type { ContactFormState, EmployeeFormFields } from '@/lib/contacts/form-utils';
import type { EmployeeSupport } from '@/components/contacts/form/use-employee-support';

/** What every section of the form needs: the state, how to change it, and what to say about a field. */
export type FormContext = {
  form: ContactFormState;
  patch: (changes: Partial<ContactFormState>) => void;
  patchEmployee: (changes: Partial<EmployeeFormFields>) => void;
  /** the message to show under a field: empty until the person has left the field or tried to save */
  errorOf: (field: FormField) => string | undefined;
  /** the person left the field */
  touch: (field: FormField) => void;
  editing: boolean;
  editingId: string | null;
  nameRef: Ref<HTMLInputElement>;
  /** Ctrl or Cmd with Enter in a text area */
  submit: () => void;
  employeeSupport: EmployeeSupport;
  /** the role may write the salary structure and the employee file */
  canManage: boolean;
  matches: ContactMatch<MatchableContact>[];
};
