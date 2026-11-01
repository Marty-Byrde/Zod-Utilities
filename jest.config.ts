import { pathsToModuleNameMapper } from 'ts-jest'
import { compilerOptions } from './tsconfig.json'
import type { Config } from '@jest/types'

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  workerThreads: true,
  testTimeout: 10000,
  verbose: true,
  setupFilesAfterEnv: ['jest-expect-message', './jest.setup.ts', './jest.mocks.ts'],
  // Other Jest configurations...

  testPathIgnorePatterns: ['dist'],
  randomize: true,

  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, {
    prefix: '<rootDir>/',
  }),
}

export default config
