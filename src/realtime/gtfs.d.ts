declare module 'gtfs-realtime-bindings' {
  const gtfs: { transit_realtime: { FeedMessage: { decode(bytes: Uint8Array): unknown; toObject(message: unknown, options: { longs: NumberConstructor; enums: StringConstructor }): unknown } } };
  export default gtfs;
}
