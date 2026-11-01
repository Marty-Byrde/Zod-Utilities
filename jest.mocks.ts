jest.mock('@/src/lib/Shared/getUUID', () => ({
  getUUID: jest.fn(() => {
    return '8b2b0fea-e4d6-4ac6-9762-b9a38f8f2d1e'
  }),
}))
