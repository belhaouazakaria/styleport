export interface TrendSignal {
  state: "KNOWN" | "NOT_APPLICABLE";
  score: number | null;
}
export interface TrendProvider {
  getSignal(input: {
    clusterKey: string;
    start: Date;
    end: Date;
  }): Promise<TrendSignal>;
}
export class NullTrendProvider implements TrendProvider {
  async getSignal(): Promise<TrendSignal> {
    return { state: "NOT_APPLICABLE", score: null };
  }
}
