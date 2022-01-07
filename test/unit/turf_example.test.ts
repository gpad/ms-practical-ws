import * as turf from "@turf/turf"
import { expect } from "chai"

/**
 * Turf documentation https://turfjs.org/
 */
describe("turf example", () => {
  it("calculate distance between 2 points", () => {
    // longitude, latitude
    const from = turf.point([-75.343, 39.984])
    const to = turf.point([-75.534, 39.123])
    const distance = turf.distance(from, to, { units: "miles" })

    expect(distance).greaterThan(60)
  })

  it("calculate circle", () => {
    const center = [-75.343, 39.984]
    const radius = 5
    const circle = turf.circle(center, radius, { steps: 10, units: "kilometers", properties: { foo: "bar" } })

    expect(turf.booleanContains(circle, turf.point(center))).true
  })

  it("calculate centers", () => {
    const features = turf.points([
      [-97.522259, 35.4691],
      [-97.502754, 35.463455],
      [-97.508269, 35.463245],
    ])

    const center = turf.center(features)

    expect(features.features.map((p) => turf.distance(p, center, { units: "meters" })).every((x) => x < 1000)).true
  })
})
