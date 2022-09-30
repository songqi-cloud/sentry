import {operations, paths} from 'sentry/openapi';

type ExtractSuccessfulResponseData<T extends keyof operations> = operations[T] extends {
  responses: {200: {content: {'application/json': any}}};
}
  ? operations[T]['responses'][200]['content']['application/json']
  : never;

export type ExtractPathResponseData<
  TPath extends keyof paths,
  TOperation extends keyof paths[TPath]
> = paths[TPath][TOperation] extends {
  responses: {200: {content: {'application/json': any}}};
}
  ? paths[TPath][TOperation]['responses'][200]['content']['application/json']
  : never;
