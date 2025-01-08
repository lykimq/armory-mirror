import { EntityStore } from '@narval/policy-engine-shared'
import { Injectable } from '@nestjs/common'
import { EntityDataStore } from '@prisma/client/armory'
import { PrismaService } from '../../../shared/module/persistence/service/prisma.service'

@Injectable()
export class EntityDataStoreRepository {
  constructor(private prismaService: PrismaService) {}

  setDataStore(clientId: string, data: { version: number; data: EntityStore }) {
    return this.prismaService.entityDataStore.create({ data: { clientId, ...data } })
  }

  async getLatestDataStore(clientId: string): Promise<EntityDataStore | null> {
    const version = await this.getLatestVersion(clientId)

    if (!version) return null

    const dataStore = await this.prismaService.entityDataStore.findFirst({ where: { clientId, version } })

    if (!dataStore) return null

    return dataStore
  }

  private async getLatestVersion(clientId: string): Promise<number> {
    const data = await this.prismaService.entityDataStore.aggregate({
      where: {
        clientId
      },
      _max: {
        version: true
      }
    })

    return data._max?.version || 0
  }
}