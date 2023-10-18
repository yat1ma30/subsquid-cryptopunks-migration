import {TypeormDatabase} from '@subsquid/typeorm-store'
import {
    processor,
    mapper,
    BLOCK_HEIGHT_TO_FETCH_PUNK_IMAGES,
    CtxWithCache,
} from './processor'
import * as model from './model'
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
            const c: CtxWithCache = {...ctx, queue, esm, transferRecorder}
            if (block.header.height > BLOCK_HEIGHT_TO_FETCH_PUNK_IMAGES) {
                // to fetch images for metadata
                await fetchAndSavePunkImagesOnce(c, log)
            }
            // decode event data and enqueue tasks
            await mapper.processLog(c, log)
        }
    }

    // processing queue
    ctx.log.debug('Processing queue...')
    // execute all queue tasks
    await queue.executeAll({
        onStart: () => esm.load(ctx),
        onEnd: () =>
            esm.flush(ctx, [
                model.Trait,
                model.Contract,
                model.Account,
                model.CToken,
                model.UserProxy,
                model.Punk,
                model.MetaData,
                model.MetaDataTrait,
                model.Ask,
                model.Bid,
            ]),
    })
    ctx.log.debug('Done.')
})
