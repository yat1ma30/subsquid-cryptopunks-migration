import {lookupArchive} from '@subsquid/archive-registry'
import {
    BlockData,
    BlockHeader,
    DataHandlerContext,
    EvmBatchProcessor,
    EvmBatchProcessorFields,
    Log as _Log,
    Transaction as _Transaction,
} from '@subsquid/evm-processor'
import {Store} from '@subsquid/typeorm-store'
import {SimpleQueue} from './context/simpleQueue'
import {EntitySyncManager} from './context/entitySyncManager'
import {TransferRecorder} from './context/transferRecorder'
import {Mapper} from './mapping/share/mapper'
import cryptopunks from './mapping/cryptopunks'
import raribleExchangeV1 from './mapping/raribleExchangeV1'
import wrappedPunks from './mapping/wrappedPunks'
import erc721sale from './mapping/erc721sale'
import opensea from './mapping/opensea'
import {patchStore} from './store'
export const BLOCK_HEIGHT_TO_FETCH_PUNK_IMAGES = 18_340_000

// monkey patch
patchStore()

export const processor = new EvmBatchProcessor()
    .setDataSource({
        archive: lookupArchive('eth-mainnet'),
        chain: 'https://rpc.ankr.com/eth',
        // chain: 'https://cloudflare-eth.com',
        // chain: 'https://rpc.flashbots.net/',
    })
    .setFinalityConfirmation(75)
    .setFields({
        transaction: {
            from: true,
            value: true,
            hash: true,
        },
    })
    .setBlockRange({
        // from: 13047091,
        from: 3914494,
    })

export const mapper = new Mapper()
    .add(cryptopunks)
    .add(wrappedPunks)
    .add(raribleExchangeV1)
    .add(erc721sale)
    .add(opensea)

mapper.getLogRequests().forEach((req) => {
    processor.addLog(req)
})

export type Fields = EvmBatchProcessorFields<typeof processor>
export type Block = BlockHeader<Fields>
export type Log = _Log<Fields>
export type Transaction = _Transaction<Fields>
export type ProcessorContext<Store> = DataHandlerContext<Store, Fields>
export type CtxWithCache = ProcessorContext<Store> & {
    queue: SimpleQueue
    esm: EntitySyncManager
    blockData: BlockData
    transferRecorder: TransferRecorder
}
