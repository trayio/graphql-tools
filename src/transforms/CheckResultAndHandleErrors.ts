import { GraphQLResolveInfo } from 'graphql';
import { checkResultAndHandleErrors } from '../stitching/errors';
import { Transform } from './transforms';

export default class CheckResultAndHandleErrors implements Transform {
  private info: GraphQLResolveInfo;
  private fieldName?: string | string[];

  constructor(info: GraphQLResolveInfo, fieldName?: string | string[]) {
    this.info = info;
    this.fieldName = fieldName;
  }

  public transformResult(result: any): any {
    return checkResultAndHandleErrors(result, this.info, this.fieldName);
  }
}
