import {TypeormDatabase} from '@subsquid/typeorm-store'
import {processor, mapper, BLOCK_HEIGHT_TO_FETCH_PUNK_IMAGES} from './processor'
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
import {TransferRecorder, EntitySyncManager, SimpleQueue} from './context'

processor.run(new TypeormDatabase({supportHotBlocks: true}), async (ctx) => {
    // making queue
    ctx.log.debug('Making queue...')
    const queue = new SimpleQueue()
    const esm = new EntitySyncManager()
    const transferRecorder = new TransferRecorder()
    for (const block of ctx.blocks) {
        for (const log of block.logs) {
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

    // processing queue
    ctx.log.debug('Processing queue...')
    // load entities from DB first
    await esm.load(ctx)
    // execute all queue tasks
    await queue.executeAll()
    // save entities to DB
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
