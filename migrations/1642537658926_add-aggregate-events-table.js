/* eslint-disable camelcase */

exports.shorthands = undefined

/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable("aggregate_events", {
    id: { type: "uuid", primaryKey: true, notNull: true },
    aggregate_id: { type: "uuid", notNull: true },
    event_name: { type: "string", notNull: true },
    aggregate_version: { type: "integer", notNull: true },
    aggregate_version_index: { type: "integer", notNull: true },
    causation_id: { type: "uuid", notNull: true },
    correlation_id: { type: "uuid", notNull: true },
    public: { type: "boolean", notNull: true },
    published: { type: "boolean", notNull: true },
    payload: { type: "jsonb", notNull: true },
  })
}

exports.down = (pgm) => {}
