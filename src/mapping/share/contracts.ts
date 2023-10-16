import * as cryptoPunksDataAbi from '../../abi/CryptoPunksData'
import {ChainContext} from '../../abi/abi.support'
import {Contract as ContractModel, MetaData} from '../../model'
import {Block, CtxWithCache, Log} from '../../processor'
import {
    BIGINT_ZERO,
    CRYPTOPUNKS_DATA_ADDRESS,
    MULTICALL_ADDRESS,
} from './constants'
import * as abiCryptoPunks from '../../abi/cryptopunks'
import * as abiWrappedPunks from '../../abi/wrappedpunks'
import * as abiCryptoPunksData from '../../abi/CryptoPunksData'
import {callOnce, chunkArray, instantiate} from '../../utils'
import {ParallelRpcCaller} from './parallelRpcCaller'
import {IsNull} from 'typeorm'

const fetchAndSavePunkImages = async (ctx: CtxWithCache, log: Log) => {
    ctx.log.info(
        `[CryptoPunksData] Fetching and saving punk images with multiple MultiCall.`,
    )
    const caller = new ParallelRpcCaller(MULTICALL_ADDRESS)
    const [entitiesToFetchImages, entitiesToFetchSvgs] = await Promise.all([
        ctx.store.find(MetaData, {
            where: {image: IsNull()},
        }),
        ctx.store.find(MetaData, {
            where: {svg: IsNull()},
        }),
    ])
    const idsToFetchImages = entitiesToFetchImages.map((e) => e.tokenId)
    const idsToFetchSvgs = entitiesToFetchSvgs.map((e) => e.tokenId)

    ctx.log.info(
        `[CryptoPunksData] Fetching ${idsToFetchImages.length} images.`,
    )
    const images = await caller.batchCall(
        ctx.log,
        log.block,
        CRYPTOPUNKS_DATA_ADDRESS,
        cryptoPunksDataAbi.functions.punkImage,
        idsToFetchImages.map((i) => [i]),
        2,
    )
    // save results
    entitiesToFetchImages.forEach((e, i) => {
        e.image = images[i]
    })
    for (const chunk of chunkArray(entitiesToFetchImages, 100)) {
        await ctx.store.upsert(chunk)
    }
    ctx.log.info(`Saved ${images.length} images.`)
    ctx.log.info(`[CryptoPunksData] Fetching ${idsToFetchSvgs.length} svgs.`)
    const svgs = await caller.batchCall(
        ctx.log,
        log.block,
        CRYPTOPUNKS_DATA_ADDRESS,
        cryptoPunksDataAbi.functions.punkImageSvg,
        idsToFetchSvgs.map((i) => [i]),
        1,
    )

    // save results
    entitiesToFetchSvgs.forEach((e, i) => {
        e.svg = svgs[i]
    })
    for (const chunk of chunkArray(entitiesToFetchSvgs, 100)) {
        await ctx.store.upsert(chunk)
    }
    ctx.log.info(`Saved ${svgs.length} svgs.`)
}

export const fetchAndSavePunkImagesOnce = callOnce(fetchAndSavePunkImages)

export async function fetchCryptoPunkContract(
    ctx: CtxWithCache,
    address: string,
) {
    ctx.log.warn(`Contract state calls: fetchCryptoPunkContract: ${address}`)
    const client = new abiCryptoPunks.Contract(
        ctx,
        ctx.blockData.header,
        address,
    )
    const symbol = await client.symbol()
    const name = await client.name()
    const imageHash = await client.imageHash()
    const totalSupply = await client.totalSupply()
    const contract = instantiate(ContractModel, {
        id: address.toLowerCase(),
        totalAmountTraded: BIGINT_ZERO,
        totalSales: BIGINT_ZERO,
        symbol,
        name,
        imageHash,
        totalSupply,
    })
    return contract
}

export async function fetchWrappedPunkContract(
    ctx: CtxWithCache,
    address: string,
) {
    ctx.log.warn(`Contract state calls: fetchWrappedPunkContract: ${address}`)
    const client = new abiWrappedPunks.Contract(
        ctx,
        ctx.blockData.header,
        address,
    )
    const symbol = await client.symbol()
    const name = await client.name()
    const totalSupply = await client.totalSupply()
    const contract = instantiate(ContractModel, {
        id: address.toLowerCase(),
        totalAmountTraded: BIGINT_ZERO,
        totalSales: BIGINT_ZERO,
        symbol,
        name,
        totalSupply,
    })
    return contract
}

export async function fetchPunkImages(
    ctx: ChainContext,
    block: Block,
    address: string,
    punkNo: number,
) {
    const client = new abiCryptoPunksData.Contract(ctx, block, address)
    const image = await client.punkImage(punkNo)
    const imageSvg = await client.punkImageSvg(punkNo)
    return {image, imageSvg}
}

// do not use this func after implementing BatchCaller class
export async function fetchBatchedPunkImages(
    ctx: CtxWithCache,
    block: Block,
    address: string,
    punkNos: number[],
    batchSize: number,
): Promise<any[]> {
    const batchedPunkNos = []
    for (let i = 0; i < punkNos.length; i += batchSize) {
        batchedPunkNos.push(punkNos.slice(i, i + batchSize))
    }
    const results = []
    for (const batch of batchedPunkNos) {
        const batchResults = await Promise.all(
            batch.map((punkNo) => fetchPunkImages(ctx, block, address, punkNo)),
        )
        results.push(...batchResults)
    }
    return results
}
