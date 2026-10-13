/** Development-only binding; Vue's production compiler removes the directive. */
import { validateSelection } from './model.mjs'

export function createVariantDirective() {
  function registerSelection(element, { value }) {
    const { selection, errors } = validateSelection(value.recipe, value.selection ?? {})
    if (errors.length > 0) {
      delete element.dataset.vanityVariant
      element.dataset.vanityVariantErrors = JSON.stringify(errors)
      return
    }
    delete element.dataset.vanityVariantErrors
    element.dataset.vanityVariant = JSON.stringify(selection)
  }
  return { mounted: registerSelection, updated: registerSelection }
}
