import {TypeormDatabase} from '@subsquid/typeorm-store'
import {
    Block,
    processor,
    mapper,
    BLOCK_HEIGHT_TO_FETCH_PUNK_IMAGES,
} from './processor'
import {EntitySyncManager} from './context/entitySyncManager'
import {SimpleQueue} from './context/simpleQueue'
import {
    Account,
    Ask,
    Bid,
    CToken,
    Contract,
    MetaData,
    MetaDataTrait,
    Punk,
    Trait,
    UserProxy,
} from './model'

import {fetchAndSavePunkImagesOnce} from './mapping/share/contracts'
import {TransferRecorder} from './context/transferRecorder'

processor.run(new TypeormDatabase({supportHotBlocks: true}), async (ctx) => {
    ctx.log.debug('Making queue...')
    const queue = new SimpleQueue()
    const esm = new EntitySyncManager()
    const transferRecorder = new TransferRecorder()
    let lastBlock: Block | undefined = undefined
    for (const block of ctx.blocks) {
        for (const log of block.logs) {
            lastBlock = log.block
            const ctxWithCache = {
                ...ctx,
                queue,
                esm,
                blockData: block,
                transferRecorder,
            }
            if (block.header.height > BLOCK_HEIGHT_TO_FETCH_PUNK_IMAGES) {
                // to fetch images for metadata
                await fetchAndSavePunkImagesOnce(ctxWithCache, log)
            }
            await mapper.processLog(ctxWithCache, log)
        }
    }

    ctx.log.debug('Processing queue...')
    if (!lastBlock) return
    await esm.load(ctx)
    await queue.executeAll()
    await esm.flush(ctx, [
        Trait,
        Contract,
        Account,
        CToken,
        UserProxy,
        Punk,
        MetaData,
        MetaDataTrait,
        Ask,
        Bid,
    ])
    ctx.log.debug('Done.')
})
