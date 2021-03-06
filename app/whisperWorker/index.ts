import * as newrelic from 'newrelic'
import * as Web3 from 'web3'
import * as Raven from 'raven'
import {env} from '@shared/environment'
import {
  resetShh,
  newBroadcastSession,
  TWhisperEntity,
  getTopic,
} from '@shared/whisper'
import {
  attesterWallet,
  requesterWallet,
} from '@shared/attestations/attestationWallets'

import {serverLogger} from '@shared/logger'

import {handleMessages} from '@shared/whisper/msgHandler'

import {listenForSolicitations} from '@shared/whisper/attesterActions'
import {sendPings, handlePongMessages} from '@shared/whisper/ping'

import {WhisperFilters} from '@shared/models'

Raven.config(env.sentryDSN, {environment: env.nodeEnv}).install()

const web3 = new Web3(new Web3.providers.HttpProvider(env.web3Provider))
const toTopic = (ascii: string) => web3.sha3(ascii).slice(0, 10)

const password = env.whisper.password

const getPingFilter = async () => {
  let existing = await WhisperFilters.findOne({
    where: {entity: 'ping'},
    logging: env.logs.whisper.sql,
  })
  return (
    existing ||
    newBroadcastSession(toTopic(getTopic('ping')), env.whisper.ping.password, 'ping')
  )
}

const main = async () => {
  try {
    if (env.whisper.ping.enabled) {
      try {
        const wf = await getPingFilter()
        if (wf) {
          console.log('Working with WhisperFilter', wf.filterId)
          try {
            await sendPings(wf, web3)
          } catch (err) {
            console.log('Unhandled error sending whisper pings', err)
          }
          try {
            await handlePongMessages(wf, web3)
          } catch (err) {
            console.log('Unhandled error handling whisper pongs', err)
          }
        } else {
          console.log('pingFilterPromise returned nothing')
        }
      } catch (err) {
        console.log('Unhandled error handling ping (general)', err)
      }
    }

    if (env.attester_rewards) {
      Object.keys(env.attester_rewards).forEach(
        async (topic_name: TWhisperEntity) => {
          let hashed_topic = toTopic(getTopic(topic_name))
          await listenForSolicitations(hashed_topic, password, topic_name)
          await handleMessages(topic_name, attesterWallet)
        }
      )
    }

    await handleMessages('requester', requesterWallet)
  } catch (error) {
    Raven.captureException(error, {
      tags: {logger: 'whisper'},
    })
    newrelic.recordCustomEvent('WhisperError', {Entity: 'Attester'})
    serverLogger.info(`Encountered error in Whisper worker! ${error}`)
    console.log(error, error.stack)
    resetShh()
  }

  setTimeout(main, env.whisperPollInterval)
}

main()
  .then(() => serverLogger.info('Finished Whisper worker!'))
  .catch(error => serverLogger.warn('Whisper worker failed with error!', error))
