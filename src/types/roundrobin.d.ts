declare module 'roundrobin' {
  export default function roundRobin<T>(count: number, participants: T[]): Array<Array<[T, T]>>;
}
