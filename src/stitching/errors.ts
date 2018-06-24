import { GraphQLResolveInfo, responsePathAsArray } from 'graphql';
import { locatedError } from 'graphql/error';

let ERROR_SYMBOL: any;
if (
  (typeof global !== 'undefined' && 'Symbol' in global) ||
  (typeof window !== 'undefined' && 'Symbol' in window)
) {
  ERROR_SYMBOL = Symbol('subSchemaErrors');
} else {
  ERROR_SYMBOL = '@@__subSchemaErrors';
}

export const ErrorSymbol = ERROR_SYMBOL;

export function annotateWithChildrenErrors(
  object: any,
  childrenErrors: Array<{ path?: Array<string | number> }>,
): any {
  if (childrenErrors && childrenErrors.length > 0) {
    if (Array.isArray(object)) {
      const byIndex = {};
      childrenErrors.forEach(error => {
        if (!error.path) {
          return;
        }
        const index = error.path[1];
        const current = byIndex[index] || [];
        current.push({
          ...error,
          path: error.path.slice(1),
        });
        byIndex[index] = current;
      });
      return object.map((item, index) =>
        annotateWithChildrenErrors(item, byIndex[index]),
      );
    } else {
      return {
        ...object,
        [ERROR_SYMBOL]: childrenErrors.map(error => ({
          ...error,
          ...error.path ? { path: error.path.slice(1) } : {},
        })),
      };
    }
  } else {
    return object;
  }
}

export function getErrorsFromParent(
  object: any,
  fieldName: string,
):
  | {
      kind: 'OWN';
      error: any;
    }
  | {
      kind: 'CHILDREN';
      errors?: Array<{ path?: Array<string | number> }>;
    } {
  const errors = (object && object[ERROR_SYMBOL]) || [];
  const childrenErrors: Array<{ path?: Array<string | number> }> = [];
  for (const error of errors) {
    if ((!error.path) || (error.path.length === 1 && error.path[0] === fieldName)) {
      return {
        kind: 'OWN',
        error,
      };
    } else if (error.path[0] === fieldName) {
      childrenErrors.push(error);
    }
  }
  return {
    kind: 'CHILDREN',
    errors: childrenErrors,
  };
}

class CombinedError extends Error {
  public errors: Error[];
  constructor(message: string, errors: Error[]) {
    super(message);
    this.errors = errors;
  }
}

export function checkResultAndHandleErrors(
  result: any,
  info: GraphQLResolveInfo,
  responseKey?: string | string[],
): any {
  if (!responseKey) {
    responseKey = info.fieldNodes[0].alias
      ? info.fieldNodes[0].alias.value
      : info.fieldName;
  }

  if (typeof responseKey === 'string') {
    responseKey = [responseKey];
  }
  function resolveData() {
    let currentData = result.data;
    for (let i = 0; i < responseKey.length; i++) {
      const fieldName = responseKey[responseKey.length - 1 - i];
      currentData = currentData[fieldName];
    }

    return currentData;
  }
  if (result.errors && (!result.data || !resolveData())) {
    // apollo-link-http & http-link-dataloader need the
    // result property to be passed through for better error handling.
    // If there is only one error, which contains a result property, pass the error through
    const newError =
      result.errors.length === 1 && hasResult(result.errors[0])
        ? result.errors[0]
        : new CombinedError(concatErrors(result.errors), result.errors);

    throw locatedError(
      newError,
      info.fieldNodes,
      responsePathAsArray(info.path),
    );
  } else {
    let resultObject = resolveData();
    if (result.errors) {
      resultObject = annotateWithChildrenErrors(
        resultObject,
        result.errors as Array<{ path?: Array<string> }>,
      );
    }
    return resultObject;
  }
}

function concatErrors(errors: Error[]) {
  return errors.map(error => error.message).join('\n');
}

function hasResult(error: any) {
  return error.result || (error.originalError && error.originalError.result);
}
