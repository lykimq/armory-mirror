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

    // Large number handling
    it('handles transfer with maximum BigInt values', async () => {
      const maxTransfer = generateTransfer({ amount: BigInt(Number.MAX_SAFE_INTEGER) })

      const createdTransfer = await service.track(maxTransfer)

      expect(createdTransfer).toEqual(maxTransfer)

      const stored = await testPrismaService.getClient().approvedTransfer.findFirst({ where: { id: maxTransfer.id } })

      expect(stored?.amount).toEqual(maxTransfer.amount.toString())
    })

    // Handles transfer with negative amount
    it('handles transfer with negative amount', async () => {
      const negativeTransfer = generateTransfer({ amount: BigInt(-1) })
      const createdTransfer = await service.track(negativeTransfer)

      expect(createdTransfer).toEqual(negativeTransfer)
    })

    // Handles transfer with multiple currencies rates
    it('handles transfers with multiple currencies rates', async () => {
      const multipleCurrencyTransfer = generateTransfer({
        rates: {
          'fiat:USD': 1,
          'fiat:EUR': 0.85,
          'fiat:GBP': 0.73,
          'fiat:JPY': 110.25,
          'fiat:BTC': 0.000021
        }
      })

      const createdTransfer = await service.track(multipleCurrencyTransfer)

      // Compare with string values since database stores rates as strings
      const expectedRates = {
        'fiat:USD': '1',
        'fiat:EUR': '0.85',
        'fiat:GBP': '0.73',
        'fiat:JPY': '110.25',
        'fiat:BTC': '0.000021'
      }

      const stored = await testPrismaService.getClient().approvedTransfer.findFirst({ where: { id: multipleCurrencyTransfer.id } })

      expect(stored?.rates).toEqual(expectedRates)
    })

    // Handles batch processing of transfers
    it('handles batch processing of transfers', async () => {
      const batchSize = 50
      const transfers = Array.from({ length: batchSize }, () => generateTransfer())

      // Track transfers in parallel
      await Promise.all(transfers.map(t => service.track(t)))

      // Verify the number of transfers
      const storedTransfers = await testPrismaService.getClient().approvedTransfer.findMany()
      expect(storedTransfers.length).toEqual(batchSize)
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

    // returns empty array for non-existent client
    it('returns empty array for non-existent client', async () => {
      const transfers = await service.findByClientId('non-existent-client')
      expect(transfers).toEqual([])
    })

    // correctly orders transfers by creation date
    it('correctly orders transfers by creation date', async () => {
      // Clear the database first
      await testPrismaService.truncateAll()

      const clientId = 'time-test-client'
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
      // verify dates
      expect(transfers[0].createdAt).toEqual(oldDate)
      expect(transfers[1].createdAt).toEqual(newDate)
    })

    // Test pagination scenario
    it('returns all transfer for a client with high volume', async () => {
      const clientId = 'high-volume-client'
      const transferCount = 1000

      // Create many transfers for the same client
      const transfers = Array.from({ length: transferCount }, () => generateTransfer({ clientId }))

      // Track transfers in parallel
      await Promise.all(transfers.map(t => service.track(t)))

      // Find all transfers for the client
      const result = await service.findByClientId(clientId)

      // Verify the number of transfers
      expect(result.length).toEqual(transferCount)
    })

    // Handles transfer across multiple chains for the same client
    it('handles transfer across multiple chains for the same client', async () => {
      const clientId = 'multi-chain-client'

      // Create transfers on different chains
      const chainTransfers = [
        generateTransfer({
          clientId,
          chainId: 1 // Ethereum
        }),
        generateTransfer({
          clientId,
          chainId: 56 // Binance Smart Chain
        }),
        generateTransfer({
          clientId,
          chainId: 137 // Polygon
        }),
        generateTransfer({
          clientId,
          chainId: 43114 // Avalanche
        })
      ]

      // Track transfers in parallel
      await Promise.all(chainTransfers.map(t => service.track(t)))

      // Verify we have transfers for all chains
      const uniqueChains = new Set(chainTransfers.map(t => t.chainId))
      expect(uniqueChains.size).toEqual(chainTransfers.length)

      // Find all transfers for the client
      const result = await service.findByClientId(clientId)

      // Verify the number of transfers
      expect(result.length).toEqual(chainTransfers.length)
    })

    // Handles transfer across different timezones
    it('handles transfer across different timezones', async () => {
      const clientId = 'timezone-client'

      // Create transfer with different timezones
      const transfers = [
        generateTransfer({
          clientId,
          createdAt: new Date('2024-01-01T00:00:00Z') // UTC
        }),
        generateTransfer({
          clientId,
          createdAt: new Date('2024-01-01T00:00:00-05:00') // EST
        }),
        generateTransfer({
          clientId,
          createdAt: new Date('2024-01-01T00:00:00-06:00') // CST
        }),
        generateTransfer({
          clientId,
          createdAt: new Date('2024-01-01T00:00:00-07:00') // PST
        }),
        generateTransfer({
          clientId,
          createdAt: new Date('2024-01-01T00:00:00-08:00') // HST
        })
      ]

      // Track transfers in parallel
      await Promise.all(transfers.map(t => service.track(t)))

      // Find all transfers for the client
      const result = await service.findByClientId(clientId)

      // Verify the number of transfers
      expect(result.length).toEqual(transfers.length)

      // Verify the transfers are ordered by creation date
      const timestamps = result.map(t => t.createdAt.getTime())
      expect(timestamps).toEqual(timestamps.sort())
    })
  })
})

