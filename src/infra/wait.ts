export function wait(timeout: number) {
  return new Promise((res, _) => {
    setTimeout(res, timeout)
  })
}

export function elapsedFrom(from: number): number {
  return Date.now() - from
}
