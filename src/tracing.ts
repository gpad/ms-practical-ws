/* eslint-disable @typescript-eslint/no-floating-promises */
// Require dependencies
const opentelemetry = require("@opentelemetry/sdk-node")
const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node")
const { JaegerExporter } = require("@opentelemetry/exporter-jaeger")
// const { PrometheusExporter } = require("@opentelemetry/exporter-prometheus");
const { Resource } = require("@opentelemetry/resources")
const { SemanticResourceAttributes } = require("@opentelemetry/semantic-conventions")

const jaegerExporter = new JaegerExporter()
// const prometheusExporter = new PrometheusExporter({ startServer: true })

const sdk = new opentelemetry.NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: "ms-template",
  }),
  traceExporter: jaegerExporter,
  // metricExporter: prometheusExporter,
  instrumentations: [getNodeAutoInstrumentations()],
})

sdk.start()
