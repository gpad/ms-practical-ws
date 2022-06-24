/**
 * Generated by postgres-schema-ts
 **/
declare namespace SqlSchema {
  export type JSONPrimitive = string | number | boolean | null
  export type JSONValue = JSONPrimitive | JSONObject | JSONArray
  export type JSONObject = { [member: string]: JSONValue }
  export type JSONArray = Array<JSONValue>

  export interface pgmigrations {
    id: number
    name: string
    run_on: Date
  }
  export interface users {
    id: string
    email: string
    date_of_birth: Date | null
    confirmed_at: Date | null
    first_name: string
    last_name: string
    version: number
    updated_at: Date
    created_at: Date
  }
  export interface aggregate_events {
    id: string
    aggregate_id: string
    event_name: string
    aggregate_version: number
    aggregate_version_index: number
    causation_id: string
    correlation_id: string
    public: boolean
    published: boolean
    payload: JSONValue
  }
}
