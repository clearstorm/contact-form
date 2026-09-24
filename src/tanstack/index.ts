/**
 * Opt-in TanStack Form bridge — import via `@clearstorm/contact-form/tanstack`.
 *
 * ```tsx
 * import { useForm } from "@tanstack/react-form";
 * import { useContactForm, ContactFormField } from "@clearstorm/contact-form/tanstack";
 * import "@clearstorm/contact-form/styles.css";
 *
 * const bridge = useContactForm(spec, { config: { endpoint } });
 * const form = useForm({ defaultValues: bridge.initialValues, … });
 *
 * <form …>
 *   {spec.fields.map((field) => (
 *     <ContactFormField key={field.id} form={form} spec={field} bridge={bridge} />
 *   ))}
 * </form>
 * ```
 */
export {
  useContactForm,
  buildInitialValues,
  buildValidators,
  normalizeValue,
  validateFieldValue,
  valuesToFormData,
  valuesToLists,
  visibleFieldNames,
  type ContactFormBridge,
  type FieldValidator,
  type FieldValue,
  type FormValues,
  type TanStackBridgeOptions,
} from "./useContactForm";
export { ContactFormField, type ContactFormFieldProps } from "./Field";