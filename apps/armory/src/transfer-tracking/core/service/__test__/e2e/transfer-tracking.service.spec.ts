import { ConfigModule } from '@narval/config-module'
import { LoggerModule } from '@narval/nestjs-shared'
import { INestApplication } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { first, map, mapValues, omit, uniq } from 'lodash/fp'
import { generateTransfer } from '../../../../../__test__/fixture/transfer-tracking.fixture'
import { load } from '../../../../../armory.config'
import { Transfer } from '../../../../../shared/core/type/transfer-tracking.type'
import { PersistenceModule } from '../../../../../shared/module/persistence/persistence.module'
import { TestPrismaService } from '../../../../../shared/module/persistence/service/test-prisma.service'
import { QueueModule } from '../../../../../shared/module/queue/queue.module'
import { TransferTrackingService } from '../../../../core/service/transfer-tracking.service'
import { TransferTrackingModule } from '../../../../transfer-tracking.module'
import { all } from 'axios'

describe(TransferTrackingService.name, () => {
  let app: INestApplication
  let module: TestingModule
  let testPrismaService: TestPrismaService
  let service: TransferTrackingService

  const transfer: Transfer = generateTransfer()

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        LoggerModule.forTest(),
        ConfigModule.forRoot({
          load: [load],
          isGlobal: true
        }),
        QueueModule.forRoot(),
        PersistenceModule,
        TransferTrackingModule
      ]
    }).compile()

    testPrismaService = module.get<TestPrismaService>(TestPrismaService)
    service = module.get<TransferTrackingService>(TransferTrackingService)

    app = module.createNestApplication()

    await app.init()
  })

  afterAll(async () => {
    await testPrismaService.truncateAll()
    await module.close()
    await app.close()
  })

  afterEach(async () => {
    await testPrismaService.truncateAll()
  })

  describe('track', () => {
    it('creates a new approved transfer', async () => {
      await service.track(transfer)

      const models = await testPrismaService.getClient().approvedTransfer.findMany()

      expect(models.length).toEqual(1)
      expect(first(models)).toEqual({
        ...transfer,
        amount: transfer.amount.toString(),
        rates: mapValues((value) => value?.toString(), transfer.rates)
      })
    })

    it('decodes created transfer', async () => {
      const createdTransfer = await service.track(transfer)

      expect(createdTransfer).toEqual(transfer)
    })

    // Create multiple transfers for the same client
    it('creates multiple transfers for the same client', async () => {
      const clientId = 'be382fa4-59e1-4622-ae5e-78ba4287a060'

      // Generate unique transfers instead of copying the same one

      const transfers = Array.from({ length: 10 }, () => ({
        ...generateTransfer({
          // Each transfer has a unique id
          clientId
        })
      }))

      // Create transfer sequentially instead of using map

      for (const t of transfers) {
        await service.track(t)
      }

      // Verify in the database
      const models = await testPrismaService.getClient().approvedTransfer.findMany({ where: { clientId } })

      // Check the number of transfers
      expect(models.length).toEqual(transfers.length)

      // Check the client id
      expect(models.every((model) => model.clientId === clientId)).toBeTruthy()

      // Compare each model with its corresponding transfer
      models.forEach((model, index) => {
        const matchingTransfer = transfers.find((t) => t.id === model.id)
        expect(model.amount).toEqual(matchingTransfer?.amount.toString())
      })
    })

    // Handle transfer with zero amount
    it('handles transfer with zero amount', async () => {
      const zeroTransfer = generateTransfer({ amount: BigInt(0) })
      const createdTransfer = await service.track(zeroTransfer)

      // Check the transfer is created
      expect(createdTransfer).toEqual(zeroTransfer)

      // Check the transfer is in the database
      const models = await testPrismaService.getClient().approvedTransfer.findMany()
      // Check the number of transfers
      expect(models.length).toEqual(1)
      // Check the amount
      expect(models[0].amount).toEqual('0')
    })
  })

  describe('findByClientId', () => {
    const clientA = 'be382fa4-59e1-4622-ae5e-78ba4287a060'
    const clientB = '908d0299-dab2-4adc-a603-9508b4a84e8d'

    beforeEach(async () => {
      await Promise.all([
        service.track({
          ...transfer,
          id: '2f68d6e1-f76c-44c8-a86f-e57c8352cf93',
          clientId: clientA
        }),
        service.track({
          ...transfer,
          id: '6deafaf3-13fe-4817-ac7e-589dfc097aa0',
          clientId: clientA
        }),
        service.track({
          ...transfer,
          id: 'b2100c63-3ee3-4044-b3da-169a3fc43d52',
          clientId: clientB
        })
      ])
    })

    it('finds client transfers', async () => {
      const transfers = await service.findByClientId(clientA)

      expect(transfers.length).toEqual(2)
      expect(uniq(map('clientId', transfers))).toEqual([clientA])
      expect(first(transfers)).toMatchObject(omit(['id', 'clientId'], transfer))
    })

    it('decodes transfers', async () => {
      const transfers = await service.findByClientId(clientA)

      expect(first(transfers)).toMatchObject(omit(['id', 'clientId'], transfer))
    })
  })

  // returns empty array for non-existent client
  it('returns empty array for non-existent client', async () => {
    const transfers = await service.findByClientId('non-existent-client')
    expect(transfers).toEqual([])
  })

  // correctly orders transfers by creation date
  it('correctly orders transfers by creation date', async () => {
    const clientId = 'be382fa4-59e1-4622-ae5e-78ba4287a060'
    const oldDate = new Date('2023-01-01')
    const newDate = new Date('2024-01-01')

    // Create transfers sequentially instead of using map
    await service.track({
      ...generateTransfer({
        clientId,
        createdAt: oldDate,
        id: 'older-transfer'
      })
    })

    await service.track({
      ...generateTransfer({
        clientId,
        createdAt: newDate,
        id: 'newer-transfer'
      })
    })

    // find transfers
    const transfers = await service.findByClientId(clientId)

    // verify length
    expect(transfers.length).toEqual(2)
    // verify ordering
    expect(transfers[0].id).toEqual('older-transfer')
    expect(transfers[1].id).toEqual('newer-transfer')
    // verify datesq
    expect(transfers[0].createdAt).toEqual(oldDate)
    expect(transfers[1].createdAt).toEqual(newDate)
  })
})

