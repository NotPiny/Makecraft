export type ModpackManifestFile = {
  minecraft: {
    version: string
    modLoaders: Array<{
      id: string
      primary: boolean
    }>
  }
  manifestType: string
  manifestVersion: number
  name: string
  version: string
  author: string
  files: Array<{
    projectID: number
    fileID: number
    required: boolean
    isLocked: boolean
  }>
  overrides: string
  image: string
}
