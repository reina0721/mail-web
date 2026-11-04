/** Symbolic Route Target：引用应用 Route，不手写 URL。 */
export type RouteTarget<RouteId extends string = string> = Readonly<{
  routeId: RouteId;
  params: Readonly<Record<string, string>>;
  query?: Readonly<Record<string, string>>;
  fragment?: string;
}>;
